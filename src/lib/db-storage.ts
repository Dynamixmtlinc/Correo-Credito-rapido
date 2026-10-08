// Almacenamiento de archivos en PostgreSQL (reemplaza Azure Blob Storage)
import { prisma } from "./prisma";
import { TipoDocumento } from "@prisma/client";

export async function storeDocumento(
  facturaId: string,
  nombre: string,
  buffer: Buffer,
  contentType: string,
  tipo: TipoDocumento = TipoDocumento.PRINCIPAL
) {
  return prisma.documento.create({
    data: {
      facturaId,
      nombre,
      contenido: buffer,
      contentType,
      tamano: buffer.length,
      tipo,
    },
  });
}

export async function getDocumentoBuffer(
  documentoId: string,
  facturaId: string
): Promise<{ buffer: Buffer; contentType: string; nombre: string } | null> {
  const doc = await prisma.documento.findFirst({
    where: { id: documentoId, facturaId },
  });
  if (!doc) return null;
  return {
    buffer: Buffer.from(doc.contenido),
    contentType: doc.contentType,
    nombre: doc.nombre,
  };
}

export async function storeAdjuntoTemporal(
  idSolicitud: string,
  nombre: string,
  buffer: Buffer,
  contentType: string
) {
  return prisma.adjuntoTemporal.create({
    data: {
      idSolicitud,
      nombre,
      contenido: buffer,
      contentType,
      tamano: buffer.length,
    },
  });
}

/**
 * Criterio del `CertificatCR.pdf` de una factura, para la página pública del proveedor.
 * Solo el certificat de la ingesta (nombre `Certificat*`, tipo PDF), nunca otro
 * documento subido desde la app. Ordenar por `createdAt asc`: el más antiguo es el
 * que guardó la ingesta.
 */
export function whereCertificat(nombresFactura: string[]) {
  return {
    factura: { nombreFactura: { in: nombresFactura } },
    contentType: "application/pdf",
    nombre: { startsWith: "Certificat", mode: "insensitive" as const },
  };
}
