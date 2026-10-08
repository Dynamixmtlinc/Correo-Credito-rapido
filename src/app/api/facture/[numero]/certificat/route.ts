import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { numerosDesdeRuta } from "@/lib/utils";
import { whereCertificat } from "@/lib/db-storage";

/**
 * El `CertificatCR.pdf` tal como llegó por correo, para que el proveedor lo vea desde
 * `/facture/{n°}`. **Ruta pública sin sesión**, como la página.
 *
 * Decisión del usuario (2026-10-08): se muestra el PDF **tal cual**, aunque traiga la
 * chaîne d'approbation y los campos internos que la página dejó de mostrar el 2026-09-03.
 *
 * Solo se sirve el certificat de la ingesta, nunca otro documento de la factura
 * (ver `whereCertificat`).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  const { numero } = await params;

  const doc = await prisma.documento.findFirst({
    where: whereCertificat(numerosDesdeRuta(numero)),
    orderBy: { createdAt: "asc" },
    select: { contenido: true, factura: { select: { nombreFactura: true } } },
  });
  if (!doc) {
    return NextResponse.json({ error: "Certificat introuvable" }, { status: 404 });
  }

  const nombre = `Certificat-${doc.factura.nombreFactura}.pdf`;
  return new Response(new Uint8Array(doc.contenido), {
    headers: {
      "Content-Type": "application/pdf",
      // `inline`: se abre en el visor del navegador en vez de descargarse.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Content-Length": doc.contenido.length.toString(),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

