import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { calcularEstatusGeneral } from "@/lib/utils";
import { EstatusAprobador } from "@prisma/client";
import { sendAdminEmail } from "@/lib/graph-app";
import type { AprobacionPayload } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body: AprobacionPayload = await req.json();

  if (!body.decision || !["APPROUVE", "REFUSE"].includes(body.decision)) {
    return apiError("Décision invalide");
  }

  const factura = await prisma.factura.findUnique({ where: { id } });
  if (!factura) return apiError("Facture non trouvée", 404);

  const userEmail = session.user.email!.toLowerCase();
  const decision = body.decision as EstatusAprobador;

  // Determinar qué rol tiene el usuario en esta factura
  let updateData: Record<string, EstatusAprobador> = {};
  let rolAprobador = "";

  if (factura.cpEmail?.toLowerCase() === userEmail && factura.etatCP === "EN_COURS") {
    updateData.etatCP = decision;
    rolAprobador = "cp";
  } else if (factura.regisseurEmail?.toLowerCase() === userEmail && factura.etatRegisseur === "EN_COURS") {
    updateData.etatRegisseur = decision;
    rolAprobador = "regisseur";
  } else if (factura.coordoEmail?.toLowerCase() === userEmail && factura.etatCoordo === "EN_COURS") {
    updateData.etatCoordo = decision;
    rolAprobador = "coordo";
  } else if (factura.dirAdjointeEmail?.toLowerCase() === userEmail && factura.etatDirAdj === "EN_COURS") {
    updateData.etatDirAdj = decision;
    rolAprobador = "dirAdj";
  } else if (factura.directionGeneraleEmail?.toLowerCase() === userEmail && factura.etatDirGen === "EN_COURS") {
    updateData.etatDirGen = decision;
    rolAprobador = "dirGen";
  } else if (factura.cooEmail?.toLowerCase() === userEmail) {
    // COO no tiene campo etat separado, usar historial
    rolAprobador = "coo";
  } else {
    return apiError("Non autorisé ou décision déjà soumise", 403);
  }

  // Calcular nuevo estado general
  const estadosActualizados = {
    etatCP: updateData.etatCP ?? factura.etatCP,
    etatRegisseur: updateData.etatRegisseur ?? factura.etatRegisseur,
    etatCoordo: updateData.etatCoordo ?? factura.etatCoordo,
    etatDirAdj: updateData.etatDirAdj ?? factura.etatDirAdj,
    etatDirGen: updateData.etatDirGen ?? factura.etatDirGen,
    cpEmail: factura.cpEmail,
    regisseurEmail: factura.regisseurEmail,
    coordoEmail: factura.coordoEmail,
    dirAdjointeEmail: factura.dirAdjointeEmail,
    directionGeneraleEmail: factura.directionGeneraleEmail,
  };

  const nuevoEstatus = calcularEstatusGeneral(estadosActualizados);

  // Actualizar en transacción
  await prisma.$transaction([
    prisma.factura.update({
      where: { id },
      data: { ...updateData, etatFacture: nuevoEstatus },
    }),
    prisma.historialAprobacion.create({
      data: {
        facturaId: id,
        rolAprobador,
        emailAprobador: session.user.email!,
        nombreAprobador: session.user.name ?? undefined,
        decision,
        comentario: body.comentario,
      },
    }),
  ]);

  // Notifier le responsable (expéditeur original) de la décision
  const appUrl = process.env.NEXTAUTH_URL ?? "";
  const decisonLabel = decision === EstatusAprobador.APPROUVE ? "approuvée" : "refusée";
  const subjectPrefix = decision === EstatusAprobador.APPROUVE ? "[APPROUVÉE]" : "[REFUSÉE]";

  sendAdminEmail({
    to: [factura.responsableEmail],
    subject: `${subjectPrefix} Facture ${factura.nombreFactura}`,
    bodyHtml: buildDecisionHtml({
      nombreFactura: factura.nombreFactura,
      noProjet: factura.noProjet,
      decision: decisonLabel,
      approverName: session.user.name ?? session.user.email!,
      approverRole: rolAprobador,
      commentaire: body.comentario,
      facturaId: id,
      appUrl,
    }),
  }).catch(console.error);

  return NextResponse.json({ ok: true, nuevoEstatus });
}

const ROL_LABELS: Record<string, string> = {
  cp: "Chargé de projet (CP)",
  regisseur: "Régisseur",
  coordo: "Coordonnateur",
  dirAdj: "Directeur adjoint",
  dirGen: "Direction générale",
  coo: "COO",
};

function buildDecisionHtml(p: {
  nombreFactura: string;
  noProjet: string;
  decision: string;
  approverName: string;
  approverRole: string;
  commentaire?: string;
  facturaId: string;
  appUrl: string;
}): string {
  const color = p.decision === "approuvée" ? "#16a34a" : "#dc2626";
  const link = `${p.appUrl}/facturas/${p.facturaId}`;
  const rolLabel = ROL_LABELS[p.approverRole] ?? p.approverRole;

  return `
    <p>La facture <strong>${p.nombreFactura}</strong> (Projet : ${p.noProjet}) a été <strong style="color:${color}">${p.decision}</strong>.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Décision par</td><td style="font-size:13px">${p.approverName}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">Rôle</td><td style="font-size:13px">${rolLabel}</td></tr>
      ${p.commentaire ? `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px;vertical-align:top">Commentaire</td><td style="font-size:13px">${p.commentaire}</td></tr>` : ""}
    </table>
    <p><a href="${link}" style="background:#2563eb;color:#fff;padding:8px 16px;border-radius:4px;text-decoration:none;font-size:13px">Voir la facture</a></p>
    <hr/>
    <p style="font-size:12px;color:#6b7280">Système d'approbation de factures</p>
  `;
}
