import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { storeAdjuntoTemporal } from "@/lib/db-storage";
import { requireAuth, apiError } from "@/lib/api-helpers";

// POST /api/adjuntos-temporal
export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const idSolicitud = formData.get("idSolicitud") as string | null;
  const nombre = (formData.get("nombre") as string) ?? file?.name ?? "adjunto";

  if (!file) return apiError("Fichier manquant");
  if (!idSolicitud) return apiError("idSolicitud manquant");

  const buffer = Buffer.from(await file.arrayBuffer());
  const adjunto = await storeAdjuntoTemporal(
    idSolicitud,
    nombre,
    buffer,
    file.type || "application/octet-stream"
  );

  return NextResponse.json({ ok: true, id: adjunto.id }, { status: 201 });
}

// GET /api/adjuntos-temporal?idSolicitud=xxx
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const idSolicitud = req.nextUrl.searchParams.get("idSolicitud");
  if (!idSolicitud) return apiError("idSolicitud manquant");

  const adjuntos = await prisma.adjuntoTemporal.findMany({
    where: { idSolicitud, facturaId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, idSolicitud: true, nombre: true, contentType: true, tamano: true, createdAt: true },
  });

  return NextResponse.json(adjuntos);
}
