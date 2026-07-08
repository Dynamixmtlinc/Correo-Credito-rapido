import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const q = req.nextUrl.searchParams.get("q") ?? "";

  const proveedores = await prisma.fournisseur.findMany({
    where: {
      activo: true,
      ...(q && { nombre: { contains: q, mode: "insensitive" } }),
    },
    orderBy: { nombre: "asc" },
    take: 30,
    select: { id: true, nombre: true, razonSocial: true, homologue: true },
  });

  return NextResponse.json(proveedores);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const prov = await prisma.fournisseur.create({
    data: {
      nombre: body.nombre,
      razonSocial: body.razonSocial,
      homologue: body.homologue ?? false,
    },
  });

  return NextResponse.json(prov, { status: 201 });
}
