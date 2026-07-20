import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storeDocumento } from "@/lib/db-storage";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { calcularEstatusGeneral } from "@/lib/utils";
import { ROL_FOURNISSEUR } from "@/lib/procesar-certificat";
import { EstatusAprobador, EstatusFactura, Prisma } from "@prisma/client";
import type { CrearFacturaPayload, FiltrosFactura } from "@/types";

// GET /api/facturas — listar con filtros
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const busqueda = searchParams.get("busqueda") ?? undefined;
  const etat = searchParams.get("etat") as EstatusFactura | null;
  const aprobadorEmail = searchParams.get("aprobador") ?? undefined;
  const page = parseInt(searchParams.get("page") ?? "1");
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50");

  const where: Prisma.FacturaWhereInput = {};

  if (busqueda) {
    where.OR = [
      { nombreFactura: { contains: busqueda, mode: "insensitive" } },
      { noProjet: { contains: busqueda, mode: "insensitive" } },
      { srmProjet: { contains: busqueda, mode: "insensitive" } },
      { fournisseur: { nombre: { contains: busqueda, mode: "insensitive" } } },
    ];
  }

  if (etat) where.etatFacture = etat;

  // Facturas que esperan la respuesta del proveedor desde la página pública.
  const reponse = searchParams.get("reponse");
  if (reponse === "attente") {
    where.historialAprobacion = { none: { rolAprobador: ROL_FOURNISSEUR } };
  } else if (reponse === "repondu") {
    where.historialAprobacion = { some: { rolAprobador: ROL_FOURNISSEUR } };
  }

  if (aprobadorEmail) {
    where.OR = [
      ...(where.OR ?? []),
      { cpEmail: aprobadorEmail },
      { regisseurEmail: aprobadorEmail },
      { coordoEmail: aprobadorEmail },
      { dirAdjointeEmail: aprobadorEmail },
      { directionGeneraleEmail: aprobadorEmail },
    ];
  }

  const [total, facturas] = await Promise.all([
    prisma.factura.count({ where }),
    prisma.factura.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        nombreFactura: true,
        noProjet: true,
        srmProjet: true,
        montant: true,
        dateFacture: true,
        dateSaisie: true,
        dateLimite: true,
        etatFacture: true,
        responsableEmail: true,
        responsableNombre: true,
        cpEmail: true,
        cpNombre: true,
        etatCP: true,
        regisseurEmail: true,
        regisseurNombre: true,
        etatRegisseur: true,
        coordoEmail: true,
        coordoNombre: true,
        etatCoordo: true,
        dirAdjointeEmail: true,
        dirAdjointeNombre: true,
        etatDirAdj: true,
        directionGeneraleEmail: true,
        directionGeneraleNombre: true,
        etatDirGen: true,
        commentairesResponsable: true,
        paimentRapide: true,
        createdAt: true,
        ecole: { select: { id: true, nombre: true } },
        fournisseur: { select: { id: true, nombre: true } },
        historialAprobacion: {
          where: { rolAprobador: ROL_FOURNISSEUR },
          select: { decision: true, comentario: true, createdAt: true },
          take: 1,
        },
      },
    }),
  ]);

  // Se aplana a `respuestaFournisseur` para que la UI no manipule el historial.
  const data = facturas.map(({ historialAprobacion, ...f }) => ({
    ...f,
    respuestaFournisseur: historialAprobacion[0] ?? null,
  }));

  return NextResponse.json({
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  });
}

// POST /api/facturas — crear factura
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const payloadRaw = formData.get("payload") as string;

  if (!payloadRaw) return apiError("Payload manquant");

  let payload: CrearFacturaPayload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return apiError("Payload invalide");
  }

  // Validaciones básicas
  if (!payload.nombreFactura?.trim()) return apiError("Nom de facture requis");
  if (!payload.noProjet?.trim()) return apiError("No. Projet requis");
  if (!payload.ecoleId) return apiError("École requise");
  if (!payload.fournisseurId) return apiError("Fournisseur requis");
  if (!payload.montant || payload.montant <= 0) return apiError("Montant invalide");
  if (!payload.dateFacture) return apiError("Date de facture requise");
  if (!file) return apiError("Fichier de facture requis");

  // Verificar duplicado
  const existente = await prisma.factura.findFirst({
    where: { nombreFactura: { equals: payload.nombreFactura, mode: "insensitive" } },
  });
  if (existente) return apiError(`Facture "${payload.nombreFactura}" existe déjà`, 409);

  // Crear factura en DB
  const factura = await prisma.factura.create({
    data: {
      nombreFactura: payload.nombreFactura,
      noProjet: payload.noProjet,
      srmProjet: payload.srmProjet,
      ecoleId: payload.ecoleId,
      fournisseurId: payload.fournisseurId,
      montant: payload.montant,
      dateFacture: new Date(payload.dateFacture),
      dateSaisie: payload.dateSaisie ? new Date(payload.dateSaisie) : new Date(),
      dateLimite: payload.dateLimite ? new Date(payload.dateLimite) : undefined,
      indiceComptable: payload.indiceComptable,
      affectationCredit: payload.affectationCredit,
      responsableEmail: session.user.email!,
      responsableNombre: session.user.name ?? undefined,
      cpEmail: payload.cpEmail,
      cpNombre: payload.cpNombre,
      regisseurEmail: payload.regisseurEmail,
      regisseurNombre: payload.regisseurNombre,
      coordoEmail: payload.coordoEmail,
      coordoNombre: payload.coordoNombre,
      dirAdjointeEmail: payload.dirAdjointeEmail,
      dirAdjointeNombre: payload.dirAdjointeNombre,
      directionGeneraleEmail: payload.directionGeneraleEmail,
      directionGeneraleNombre: payload.directionGeneraleNombre,
      cooEmail: payload.cooEmail,
      cooNombre: payload.cooNombre,
      etatCP: payload.cpEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      etatRegisseur: payload.regisseurEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      etatCoordo: payload.coordoEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      etatDirAdj: payload.dirAdjointeEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      etatDirGen: payload.directionGeneraleEmail ? EstatusAprobador.EN_COURS : EstatusAprobador.VACIO,
      etatFacture: payload.cpEmail || payload.regisseurEmail ? EstatusFactura.EN_COURS : EstatusFactura.OUVERT,
      repartitionRequise: payload.repartitionRequise ?? false,
      raisonSocialConforme: payload.raisonSocialConforme ?? false,
      dixPourcentVerifier: payload.dixPourcentVerifier ?? false,
      fourHomologue: payload.fourHomologue ?? false,
      paimentRapide: payload.paimentRapide ?? false,
      affectationCreditCheck: payload.affectationCreditCheck ?? false,
      commentairesResponsable: payload.commentairesResponsable,
    },
  });

  // Guardar PDF en base de datos
  const buffer = Buffer.from(await file.arrayBuffer());
  await storeDocumento(factura.id, file.name, buffer, file.type || "application/pdf");

  // Vincular adjuntos temporales si hay idSolicitudTemporal
  if (payload.idSolicitudTemporal) {
    await prisma.adjuntoTemporal.updateMany({
      where: { idSolicitud: payload.idSolicitudTemporal },
      data: { facturaId: factura.id },
    });
  }

  return NextResponse.json({ id: factura.id, nombreFactura: factura.nombreFactura }, { status: 201 });
}
