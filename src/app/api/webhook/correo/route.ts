import { NextRequest, NextResponse } from "next/server";
import {
  getAdminMessage,
  getMessageAttachments,
  sendAdminEmail,
} from "@/lib/graph-app";
import { procesarCertificat } from "@/lib/procesar-certificat";

// Solo se procesan correos de este remitente autorizado
const REMITENTE_AUTORIZADO = "acostasalcedo.d@csdm.qc.ca";

// GET — Graph API llama esto para validar la suscripción
export async function GET(req: NextRequest) {
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (!validationToken) {
    return new NextResponse("validationToken manquant", { status: 400 });
  }
  return new NextResponse(validationToken, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

interface GraphNotification {
  clientState: string;
  changeType: string;
  resourceData: { id: string };
}

// POST — Graph API notifica un nuevo correo en el inbox de admin
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.value?.length) {
    return NextResponse.json({ ok: true });
  }

  const secret = process.env.WEBHOOK_SECRET;
  const notifications = body.value as GraphNotification[];

  // Responder 202 inmediatamente (Graph exige respuesta < 30s)
  const valid = notifications.filter(
    (n) => n.clientState === secret && n.changeType === "created"
  );

  if (valid.length > 0) {
    Promise.allSettled(
      valid.map((n) => processEmailNotification(n.resourceData.id))
    ).catch(console.error);
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}

async function processEmailNotification(messageId: string) {
  let fromEmail = REMITENTE_AUTORIZADO;

  try {
    const message = await getAdminMessage(messageId);
    fromEmail = message.from.emailAddress.address.toLowerCase();

    // Ignorar correos de remitentes no autorizados
    if (fromEmail !== REMITENTE_AUTORIZADO.toLowerCase()) return;

    // El PDF adjunto es la fuente de verdad: el asunto y el cuerpo del correo no
    // contienen los datos de la factura. Sin PDF no hay nada que procesar — y no se
    // avisa, porque el mismo remitente envía correos que no son facturas.
    if (!message.hasAttachments) return;

    const attachments = await getMessageAttachments(messageId);
    const pdf = attachments.find(
      (a) =>
        a.contentType === "application/pdf" ||
        a.name.toLowerCase().endsWith(".pdf")
    );
    if (!pdf) return;

    const result = await procesarCertificat(
      Buffer.from(pdf.contentBytes, "base64"),
      {
        pdfNombre: pdf.name,
        pdfContentType: pdf.contentType || "application/pdf",
        responsableEmail: fromEmail,
        fechaRecepcion: message.receivedDateTime
          ? new Date(message.receivedDateTime)
          : undefined,
      }
    );

    if (!result.ok) {
      await sendAdminEmail({
        to: [fromEmail],
        subject: `[ERREUR] ${message.subject ?? "Facture"}`,
        bodyHtml: buildErrorHtml(message.subject ?? "", result.errors),
      });
      return;
    }

    await sendAdminEmail({
      to: [fromEmail],
      subject: `[${result.creada ? "CRÉÉE" : "MISE À JOUR"}] Facture ${result.nombreFactura}`,
      bodyHtml: buildSuccessHtml(result.nombreFactura, result.creada, result.warnings),
    });
  } catch (err) {
    console.error("[webhook/correo] Error:", err);
    try {
      await sendAdminEmail({
        to: [fromEmail],
        subject: "[ERREUR SYSTÈME] Traitement du courriel",
        bodyHtml: buildErrorHtml("", [
          "Une erreur système est survenue. Contactez l'administrateur.",
        ]),
      });
    } catch {
      // silenciar error secundario
    }
  }
}

/** URL pública que el fournisseur usa para répondre. Debe ser deducible a la main. */
function urlFacture(nombreFactura: string): string {
  const base = process.env.NEXTAUTH_URL ?? "";
  return `${base}/facture/${encodeURIComponent(nombreFactura)}`;
}

function buildErrorHtml(subject: string, errors: string[]): string {
  const titre = subject
    ? `Le traitement du courriel <strong>${subject}</strong> a échoué :`
    : "Le traitement du courriel a échoué :";
  return `
    <p>${titre}</p>
    <ul style="color:#b91c1c">${errors.map((e) => `<li>${e}</li>`).join("")}</ul>
    <p>Corrigez le document et renvoyez le courriel à <a href="mailto:${process.env.WEBHOOK_ADMIN_EMAIL}">${process.env.WEBHOOK_ADMIN_EMAIL}</a>.</p>
    <hr/>
    <p style="font-size:12px;color:#6b7280">Système d'approbation de factures</p>
  `;
}

function buildSuccessHtml(
  nombreFactura: string,
  creada: boolean,
  warnings: string[]
): string {
  const link = urlFacture(nombreFactura);
  const verbe = creada ? "a été créée" : "a été mise à jour";

  const avis =
    warnings.length > 0
      ? `<p style="margin-top:16px"><strong>À vérifier :</strong></p>
         <ul style="color:#b45309;font-size:13px">${warnings
           .map((w) => `<li>${w}</li>`)
           .join("")}</ul>`
      : "";

  return `
    <p>La facture <strong>${nombreFactura}</strong> ${verbe} dans le système.</p>
    <p style="margin-top:16px">Lien à transmettre au fournisseur :</p>
    <p><a href="${link}">${link}</a></p>
    ${avis}
    <hr/>
    <p style="font-size:12px;color:#6b7280">Système d'approbation de factures</p>
  `;
}
