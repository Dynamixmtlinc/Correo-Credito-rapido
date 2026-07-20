/**
 * Convierte un `CertificatCR.pdf` en una factura del sistema.
 *
 * Vive fuera del webhook para poder reutilizarse en el backfill de los correos
 * que ya estaban en el buzón antes de activar la suscripción de Graph.
 */

import { prisma } from "@/lib/prisma";
import { storeDocumento } from "@/lib/db-storage";
import { parseCertificat, type CertificatData } from "@/lib/certificat-parser";
import { EstatusAprobador, EstatusFactura } from "@prisma/client";

/** Rol con el que se registra la respuesta del proveedor en el historial. */
export const ROL_FOURNISSEUR = "fournisseur";

export type ResultadoIngesta =
  | { ok: true; facturaId: string; nombreFactura: string; creada: boolean; warnings: string[] }
  | { ok: false; errors: string[] };

/** Estatus del PDF → enum del sistema. Lo desconocido no se fuerza a una decisión. */
function mapEstatus(texto?: string): EstatusAprobador {
  const t = (texto ?? "").trim().toLowerCase();
  if (t.startsWith("approuv")) return EstatusAprobador.APPROUVE;
  if (t.startsWith("refus")) return EstatusAprobador.REFUSE;
  return EstatusAprobador.VACIO;
}

/** Reparte la cadena del PDF sobre los campos nombre/etat que ya existen en Factura. */
function mapearCadena(data: CertificatData) {
  const buscar = (rol: string) =>
    data.chaineApprobation.find((a) => a.rol === rol);

  const cp = buscar("Chargé de projet");
  const reg = buscar("Régisseur");
  const coord = buscar("Coordonnateur");
  const dirAdj = buscar("Direction adjointe de service");
  const dirServ = buscar("Direction de service");

  return {
    cpNombre: cp?.nombre,
    regisseurNombre: reg?.nombre,
    coordoNombre: coord?.nombre,
    dirAdjointeNombre: dirAdj?.nombre,
    directionGeneraleNombre: dirServ?.nombre,
    etatCP: mapEstatus(cp?.estatus),
    etatRegisseur: mapEstatus(reg?.estatus),
    etatCoordo: mapEstatus(coord?.estatus),
    etatDirAdj: mapEstatus(dirAdj?.estatus),
    etatDirGen: mapEstatus(dirServ?.estatus),
  };
}

/** Busca école/fournisseur por nombre. Si no hay match se deja sin asignar. */
async function resolverCatalogos(data: CertificatData, warnings: string[]) {
  let ecoleId: string | undefined;
  let fournisseurId: string | undefined;

  if (data.ecole) {
    const ecole = await prisma.ecole.findFirst({
      where: { nombre: { contains: data.ecole, mode: "insensitive" }, activo: true },
    });
    if (ecole) ecoleId = ecole.id;
    else warnings.push(`École "${data.ecole}" introuvable dans le catalogue`);
  }

  if (data.fournisseur) {
    const fournisseur = await prisma.fournisseur.findFirst({
      where: { nombre: { contains: data.fournisseur, mode: "insensitive" }, activo: true },
    });
    if (fournisseur) fournisseurId = fournisseur.id;
    else warnings.push(`Fournisseur "${data.fournisseur}" introuvable dans le catalogue`);
  }

  return { ecoleId, fournisseurId };
}

export async function procesarCertificat(
  pdfBuffer: Buffer,
  opciones: {
    pdfNombre?: string;
    pdfContentType?: string;
    responsableEmail: string;
    fechaRecepcion?: Date;
  }
): Promise<ResultadoIngesta> {
  const parsed = await parseCertificat(pdfBuffer);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const data = parsed.data;
  const warnings = [...parsed.warnings];
  const { ecoleId, fournisseurId } = await resolverCatalogos(data, warnings);
  const cadena = mapearCadena(data);

  // `montant` y `dateFacture` son obligatorios en el schema pero pueden faltar en el
  // PDF. Se usa un valor de reserva y se avisa, en vez de descartar la factura entera.
  const montant = data.montantTotal ?? 0;
  if (data.montantTotal === undefined) {
    warnings.push("MONTANT TOTAL absent — enregistré à 0, à corriger manuellement");
  }

  const dateFacture = data.dateFacture
    ? new Date(data.dateFacture)
    : (opciones.fechaRecepcion ?? new Date());
  if (!data.dateFacture) {
    warnings.push("DATE DE LA FACTURE absente — date de réception utilisée");
  }

  const campos = {
    noProjet: data.projet ?? "",
    srmProjet: data.projet,
    ecoleId,
    fournisseurId,
    montant,
    dateFacture,
    dateSaisie: data.dateSaisie ? new Date(data.dateSaisie) : new Date(),
    indiceComptable: data.indiceComptable,
    responsableEmail: opciones.responsableEmail,
    responsableNombre: data.agentAdministratif,
    fourHomologue: data.fournisseurHomologue,
    paimentRapide: data.paiementRapide,
    ...cadena,
  };

  // Idempotente: si el correo se reenvía, se actualiza en vez de duplicar o fallar.
  const existente = await prisma.factura.findFirst({
    where: { nombreFactura: data.nombreFactura },
    select: { id: true },
  });

  let facturaId: string;
  let creada: boolean;

  if (existente) {
    // Una factura ya respondida por el proveedor no se toca: su decisión manda
    // sobre cualquier reenvío posterior del mismo PDF.
    const respondida = await prisma.historialAprobacion.findFirst({
      where: { facturaId: existente.id, rolAprobador: ROL_FOURNISSEUR },
      select: { id: true },
    });

    if (respondida) {
      warnings.push(
        "Facture déjà répondue par le fournisseur — contenu conservé, non écrasé"
      );
      return {
        ok: true,
        facturaId: existente.id,
        nombreFactura: data.nombreFactura,
        creada: false,
        warnings,
      };
    }

    await prisma.factura.update({ where: { id: existente.id }, data: campos });
    facturaId = existente.id;
    creada = false;
  } else {
    const factura = await prisma.factura.create({
      data: { ...campos, nombreFactura: data.nombreFactura },
    });
    facturaId = factura.id;
    creada = true;
  }

  // El PDF se guarda una sola vez por factura.
  const yaTieneDoc = await prisma.documento.findFirst({
    where: { facturaId },
    select: { id: true },
  });
  if (!yaTieneDoc) {
    await storeDocumento(
      facturaId,
      opciones.pdfNombre ?? "CertificatCR.pdf",
      pdfBuffer,
      opciones.pdfContentType ?? "application/pdf"
    );
  }

  return { ok: true, facturaId, nombreFactura: data.nombreFactura, creada, warnings };
}

/**
 * Registra la decisión del proveedor. Se acepta **una sola** por factura: la ruta
 * pública es adivinable, así que una segunda respuesta no puede sobrescribir la
 * primera.
 */
export async function registrarRespuestaFournisseur(params: {
  facturaId: string;
  decision: "APPROUVE" | "REFUSE";
  comentario?: string;
  ip?: string;
}): Promise<{ ok: true } | { ok: false; motivo: "deja_repondu" }> {
  const previa = await prisma.historialAprobacion.findFirst({
    where: { facturaId: params.facturaId, rolAprobador: ROL_FOURNISSEUR },
    select: { id: true },
  });
  if (previa) return { ok: false, motivo: "deja_repondu" };

  const etatFacture =
    params.decision === EstatusAprobador.APPROUVE
      ? EstatusFactura.EN_COURS
      : EstatusFactura.REFUSE;

  await prisma.$transaction([
    prisma.historialAprobacion.create({
      data: {
        facturaId: params.facturaId,
        rolAprobador: ROL_FOURNISSEUR,
        // No hay cuenta detrás: se guarda la IP como rastro de origen.
        emailAprobador: params.ip ?? "inconnu",
        decision: params.decision,
        comentario: params.comentario,
      },
    }),
    prisma.factura.update({
      where: { id: params.facturaId },
      data: { etatFacture },
    }),
  ]);

  return { ok: true };
}
