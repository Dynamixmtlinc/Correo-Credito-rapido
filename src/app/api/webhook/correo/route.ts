import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getAdminMessage,
  getMessageAttachments,
  sendAdminEmail,
} from "@/lib/graph-app";
import { parseFacturaEmail } from "@/lib/email-parser";
import { storeDocumento } from "@/lib/db-storage";
import { calcularEstatusGeneral } from "@/lib/utils";
import { EstatusAprobador } from "@prisma/client";

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
  const appUrl = process.env.NEXTAUTH_URL ?? "";
  let fromEmail = REMITENTE_AUTORIZADO;

  try {
    const message = await getAdminMessage(messageId);
    fromEmail = message.from.emailAddress.address.toLowerCase();

    // Ignorar correos de remitentes no autorizados
    if (fromEmail !== REMITENTE_AUTORIZADO.toLowerCase()) {
      return;
    }

    const subject = message.subject?.trim() ?? "";

    // Solo procesar correos con prefijo [FACTURE]
    if (!subject.startsWith("[FACTURE]")) return;

    // Parsear cuerpo
    const result = parseFacturaEmail(
      subject,
      message.body.content,
      message.body.contentType
    );

    if (!result.ok) {
      await sendAdminEmail({
        to: [fromEmail],
        subject: `[ERREUR] ${subject}`,
        bodyHtml: buildErrorHtml(subject, result.errors),
      });
      return;
    }

    const { data } = result;

    // Buscar école por nombre
    const ecole = await prisma.ecole.findFirst({
      where: {
        nombre: { contains: data.ecoleName, mode: "insensitive" },
        activo: true,
      },
    });
    if (!ecole) {
      await sendAdminEmail({
        to: [fromEmail],
        subject: `[ERREUR] ${subject}`,
        bodyHtml: buildErrorHtml(subject, [
          `École introuvable: "${data.ecoleName}"`,
        ]),
      });
      return;
    }

    // Buscar fournisseur por nombre
    const fournisseur = await prisma.fournisseur.findFirst({
      where: {
        nombre: { contains: data.fournisseurName, mode: "insensitive" },
        activo: true,
      },
    });
    if (!fournisseur) {
      await sendAdminEmail({
        to: [fromEmail],
        subject: `[ERREUR] ${subject}`,
        bodyHtml: buildErrorHtml(subject, [
          `Fournisseur introuvable: "${data.fournisseurName}"`,
        ]),
      });
      return;
    }

    // Verificar duplicado
    const existing = await prisma.factura.findFirst({
      where: {
        nombreFactura: { equals: data.nombreFactura, mode: "insensitive" },
      },
    });
    if (existing) {
      await sendAdminEmail({
        to: [fromEmail],
        subject: `[ERREUR] ${subject}`,
        bodyHtml: buildErrorHtml(subject, [
          `Facture "${data.nombreFactura}" existe déjà dans le système`,
        ]),
      });
      return;
    }

    // Obtener primer PDF adjunto
    let pdfBuffer: Buffer | null = null;
    let pdfName = "factura.pdf";
    let pdfContentType = "application/pdf";

    if (message.hasAttachments) {
      const attachments = await getMessageAttachments(messageId);
      const pdf = attachments.find(
        (a) =>
          a.contentType === "application/pdf" ||
          a.name.toLowerCase().endsWith(".pdf")
      );
      if (pdf) {
        pdfBuffer = Buffer.from(pdf.contentBytes, "base64");
        pdfName = pdf.name;
        pdfContentType = pdf.contentType || "application/pdf";
      }
    }

    if (!pdfBuffer) {
      await sendAdminEmail({
        to: [fromEmail],
        subject: `[ERREUR] ${subject}`,
        bodyHtml: buildErrorHtml(subject, [
          "Aucune pièce jointe PDF trouvée. Joignez le fichier PDF de la facture.",
        ]),
      });
      return;
    }

    // Calcular estados de aprobadores
    const etatCP = data.cpEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO;
    const etatRegisseur = data.regisseurEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO;
    const etatCoordo = data.coordoEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO;
    const etatDirAdj = data.dirAdjointeEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO;
    const etatDirGen = data.directionGeneraleEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO;

    const etatFacture = calcularEstatusGeneral({
      etatCP,
      etatRegisseur,
      etatCoordo,
      etatDirAdj,
      etatDirGen,
      cpEmail: data.cpEmail,
      regisseurEmail: data.regisseurEmail,
      coordoEmail: data.coordoEmail,
      dirAdjointeEmail: data.dirAdjointeEmail,
      directionGeneraleEmail: data.directionGeneraleEmail,
    });

    // Crear factura en DB
    const factura = await prisma.factura.create({
      data: {
        nombreFactura: data.nombreFactura,
        noProjet: data.noProjet,
        srmProjet: data.srmProjet,
        ecoleId: ecole.id,
        fournisseurId: fournisseur.id,
        montant: data.montant,
        dateFacture: new Date(data.dateFacture),
        dateSaisie: new Date(),
        dateLimite: data.dateLimite ? new Date(data.dateLimite) : undefined,
        indiceComptable: data.indiceComptable,
        affectationCredit: data.affectationCredit,
        responsableEmail: fromEmail,
        cpEmail: data.cpEmail,
        regisseurEmail: data.regisseurEmail,
        coordoEmail: data.coordoEmail,
        dirAdjointeEmail: data.dirAdjointeEmail,
        directionGeneraleEmail: data.directionGeneraleEmail,
        cooEmail: data.cooEmail,
        etatCP,
        etatRegisseur,
        etatCoordo,
        etatDirAdj,
        etatDirGen,
        etatFacture,
        repartitionRequise: data.repartitionRequise,
        raisonSocialConforme: data.raisonSocialConforme,
        dixPourcentVerifier: data.dixPourcentVerifier,
        fourHomologue: data.fourHomologue,
        paimentRapide: data.paimentRapide,
        affectationCreditCheck: data.affectationCreditCheck,
        commentairesResponsable: data.commentairesResponsable,
      },
    });

    // Guardar PDF en base de datos
    await storeDocumento(factura.id, pdfName, pdfBuffer, pdfContentType);

    // Notificar éxito al remitente
    await sendAdminEmail({
      to: [fromEmail],
      subject: `[CRÉÉE] Facture ${data.nombreFactura}`,
      bodyHtml: buildSuccessHtml(data.nombreFactura, factura.id, appUrl),
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

function buildErrorHtml(subject: string, errors: string[]): string {
  const titre = subject
    ? `Le traitement du courriel <strong>${subject}</strong> a échoué :`
    : "Le traitement du courriel a échoué :";
  return `
    <p>${titre}</p>
    <ul style="color:#b91c1c">${errors.map((e) => `<li>${e}</li>`).join("")}</ul>
    <p>Corrigez les informations et renvoyez le courriel à <a href="mailto:${process.env.WEBHOOK_ADMIN_EMAIL}">${process.env.WEBHOOK_ADMIN_EMAIL}</a>.</p>
    <hr/>
    <p style="font-size:12px;color:#6b7280">Système d'approbation de factures</p>
  `;
}

function buildSuccessHtml(
  nombreFactura: string,
  facturaId: string,
  appUrl: string
): string {
  const link = `${appUrl}/facturas/${facturaId}`;
  return `
    <p>La facture <strong>${nombreFactura}</strong> a été créée avec succès dans le système.</p>
    <p><a href="${link}" style="background:#2563eb;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none">Voir la facture</a></p>
    <hr/>
    <p style="font-size:12px;color:#6b7280">Système d'approbation de factures</p>
  `;
}
