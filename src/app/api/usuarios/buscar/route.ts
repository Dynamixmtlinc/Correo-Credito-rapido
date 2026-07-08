import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import { searchUsers } from "@/lib/graph";

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.length < 2) return NextResponse.json([]);

  if (!session.accessToken) return apiError("Token d'accès manquant", 401);

  const usuarios = await searchUsers(q, session.accessToken);
  return NextResponse.json(usuarios);
}
