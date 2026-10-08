import { NextRequest, NextResponse } from "next/server";
import {
  getAdminMessage,
  getMessageAttachments,
  sendAdminEmail,
} from "@/lib/graph-app";
import { procesarCertificat } from "@/lib/procesar-certificat";
import { esAsuntoCertificat, esRemitenteAutorizado } from "@/lib/ingesta-filtro";

// A quién avisar de un `[ERREUR SYSTÈME]` si el fallo ocurre antes de saber el remitente.
const AVISO_POR_DEFECTO = "acostasalcedo.d@csdm.qc.ca";

/**
 * Devuelve el token de validación tal cual, en texto plano.
 * Graph exige status 200 + `text/plain` + el token en el cuerpo, en menos de 10 s.
 */
function respuestaValidacion(token: string) {
  return new NextResponse(token, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// GET — se conserva por comodidad para probar el endpoint a mano.
export async function GET(req: NextRequest) {
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (!validationToken) {
    return new NextResponse("validationToken manquant", { status: 400 });
  }
  return respuestaValidacion(validationToken);
}

interface GraphNotification {
  clientState: string;
  changeType: string;
  resourceData: { id: string };
}

// POST — Graph API notifica un nuevo correo en el inbox de admin
export async function POST(req: NextRequest) {
  // Al crear o renovar una suscripción, Graph valida el endpoint con un **POST**
  // que lleva `?validationToken=` y **sin** cuerpo JSON. Hay que responderlo antes
  // de intentar leer el body, o la suscripción nunca llega a crearse.
  const validationToken = req.nextUrl.searchParams.get("validationToken");
  if (validationToken) return respuestaValidacion(validationToken);

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
  let fromEmail = AVISO_POR_DEFECTO;

  try {
    const message = await getAdminMessage(messageId);
    fromEmail = message.from.emailAddress.address.toLowerCase();

    // Solo remitentes @csdm.qc.ca y solo asuntos `SRM_Projet …`; el resto se ignora
    // en silencio, porque los mismos remitentes envían correos que no son facturas.
    if (!esRemitenteAutorizado(fromEmail)) return;
    if (!esAsuntoCertificat(message.subject)) return;

    // El PDF adjunto es la fuente de verdad: el asunto y el cuerpo del correo no
    // contienen los datos de la factura. Sin PDF no hay nada que procesar.
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

    // **La ingesta correcta NO envía correo.** El único correo que emite el sistema es
    // el de la respuesta del fournisseur (`[J'ACCEPTE]` / `[JE CONTESTE]`). Antes se
    // mandaba también un acuse `[CRÉÉE]` / `[MISE À JOUR]` con el enlace, y al
    // responder una factura acostasalcedo recibía dos correos seguidos. El enlace no
    // hace falta en un correo: la URL es deducible a propósito (`/facture/{n°}`) y él
    // ya la construye a mano. Cliente, 2026-08-17.
    // Los fallos (`[ERREUR]` / `[ERREUR SYSTÈME]`) sí siguen avisando.
    console.log(
      `[webhook/correo] Facture ${result.nombreFactura} ${result.creada ? "créée" : "mise à jour"}` +
        (result.warnings.length ? ` — avis: ${result.warnings.join(" | ")}` : "")
    );
  } catch (err) {
    console.error("[webhook/correo] Error:", err);
    // Nunca contestar a un remitente de fuera del dominio.
    if (!esRemitenteAutorizado(fromEmail)) return;
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
