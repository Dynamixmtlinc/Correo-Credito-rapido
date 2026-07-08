import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storeDocumento } from "@/lib/db-storage";
import { requireAuth, apiError } from "@/lib/api-helpers";

// GET /api/facturas/[id]/documentos
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const documentos = await prisma.documento.findMany({
    where: { facturaId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      facturaId: true,
      nombre: true,
      contentType: true,
      tamano: true,
      tipo: true,
      createdAt: true,
    },
  });

  // Construir URL de descarga usando el endpoint existente (sin blob storage)
  const docs = documentos.map((doc) => ({
    ...doc,
    downloadUrl: `/api/facturas/${id}/documentos/${doc.id}/descargar`,
  }));

  return NextResponse.json(docs);
}

// POST /api/facturas/[id]/documentos — subir adjunto
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const factura = await prisma.factura.findUnique({ where: { id }, select: { id: true } });
  if (!factura) return apiError("Facture non trouvée", 404);

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const tipo = (formData.get("tipo") as string) ?? "ADJUNTO";

  if (!file) return apiError("Fichier manquant");

  const buffer = Buffer.from(await file.arrayBuffer());
  const documento = await storeDocumento(
    id,
    file.name,
    buffer,
    file.type || "application/octet-stream",
    tipo as "PRINCIPAL" | "CREDITO" | "ADJUNTO"
  );

  return NextResponse.json(
    { id: documento.id, nombre: documento.nombre, tamano: documento.tamano },
    { status: 201 }
  );
}
