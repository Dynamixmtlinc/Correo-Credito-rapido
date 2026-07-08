import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const q = req.nextUrl.searchParams.get("q") ?? "";

  const escuelas = await prisma.ecole.findMany({
    where: {
      activo: true,
      ...(q && { nombre: { contains: q, mode: "insensitive" } }),
    },
    orderBy: { nombre: "asc" },
    take: 30,
    select: { id: true, nombre: true, codigo: true },
  });

  return NextResponse.json(escuelas);
}
