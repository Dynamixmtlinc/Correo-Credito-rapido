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
