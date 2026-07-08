import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { calcularEstatusGeneral } from "@/lib/utils";
import { EstatusAprobador } from "@prisma/client";
import type { ActualizarFacturaPayload } from "@/types";

// GET /api/facturas/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const factura = await prisma.factura.findUnique({
    where: { id },
    include: {
      ecole: true,
      fournisseur: true,
      documentos: { orderBy: { createdAt: "asc" } },
      historialAprobacion: { orderBy: { createdAt: "desc" } },
      bureau: true,
    },
  });

  if (!factura) return apiError("Facture non trouvée", 404);
  return NextResponse.json(factura);
}

// PATCH /api/facturas/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body: ActualizarFacturaPayload = await req.json();

  const factura = await prisma.factura.findUnique({ where: { id } });
  if (!factura) return apiError("Facture non trouvée", 404);

  // Solo responsable o admin puede editar
  const esResponsable =
    factura.responsableEmail.toLowerCase() === session.user.email!.toLowerCase();
  if (!esResponsable) return apiError("Non autorisé", 403);

  const updated = await prisma.factura.update({
    where: { id },
    data: {
      ...(body.nombreFactura && { nombreFactura: body.nombreFactura }),
      ...(body.noProjet && { noProjet: body.noProjet }),
      ...(body.srmProjet !== undefined && { srmProjet: body.srmProjet }),
      ...(body.ecoleId && { ecoleId: body.ecoleId }),
      ...(body.fournisseurId && { fournisseurId: body.fournisseurId }),
      ...(body.montant !== undefined && { montant: body.montant }),
      ...(body.dateFacture && { dateFacture: new Date(body.dateFacture) }),
      ...(body.dateLimite !== undefined && {
        dateLimite: body.dateLimite ? new Date(body.dateLimite) : null,
      }),
      ...(body.indiceComptable !== undefined && { indiceComptable: body.indiceComptable }),
      ...(body.affectationCredit !== undefined && { affectationCredit: body.affectationCredit }),
      ...(body.cpEmail !== undefined && {
        cpEmail: body.cpEmail,
        cpNombre: body.cpNombre,
        etatCP: body.cpEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      }),
      ...(body.regisseurEmail !== undefined && {
        regisseurEmail: body.regisseurEmail,
        regisseurNombre: body.regisseurNombre,
        etatRegisseur: body.regisseurEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      }),
      ...(body.coordoEmail !== undefined && {
        coordoEmail: body.coordoEmail,
        coordoNombre: body.coordoNombre,
        etatCoordo: body.coordoEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      }),
      ...(body.dirAdjointeEmail !== undefined && {
        dirAdjointeEmail: body.dirAdjointeEmail,
        dirAdjointeNombre: body.dirAdjointeNombre,
        etatDirAdj: body.dirAdjointeEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      }),
      ...(body.directionGeneraleEmail !== undefined && {
        directionGeneraleEmail: body.directionGeneraleEmail,
        directionGeneraleNombre: body.directionGeneraleNombre,
        etatDirGen: body.directionGeneraleEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      }),
      ...(body.repartitionRequise !== undefined && { repartitionRequise: body.repartitionRequise }),
      ...(body.raisonSocialConforme !== undefined && { raisonSocialConforme: body.raisonSocialConforme }),
      ...(body.dixPourcentVerifier !== undefined && { dixPourcentVerifier: body.dixPourcentVerifier }),
      ...(body.fourHomologue !== undefined && { fourHomologue: body.fourHomologue }),
      ...(body.paimentRapide !== undefined && { paimentRapide: body.paimentRapide }),
      ...(body.affectationCreditCheck !== undefined && { affectationCreditCheck: body.affectationCreditCheck }),
      ...(body.commentairesResponsable !== undefined && { commentairesResponsable: body.commentairesResponsable }),
      ...(body.commentairesAdmin !== undefined && { commentairesAdmin: body.commentairesAdmin }),
      ...(body.etatFacture && { etatFacture: body.etatFacture }),
    },
  });

  return NextResponse.json(updated);
}
