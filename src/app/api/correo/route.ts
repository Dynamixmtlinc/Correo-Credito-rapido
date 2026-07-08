import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError, parseBody } from "@/lib/api-helpers";
import { sendEmail } from "@/lib/graph";
import type { EnviarCorreoPayload } from "@/types";

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await parseBody<EnviarCorreoPayload>(req);
  if (!body) return apiError("Payload invalide");
  if (!body.to?.length) return apiError("Destinataire requis");
  if (!body.subject?.trim()) return apiError("Objet requis");
  if (!body.bodyHtml?.trim()) return apiError("Corps du message requis");

  if (!session.accessToken) return apiError("Token d'accès manquant", 401);

  await sendEmail(
    {
      to: body.to,
      cc: body.cc,
      subject: body.subject,
      bodyHtml: body.bodyHtml,
    },
    session.accessToken
  );

  return NextResponse.json({ ok: true });
}
