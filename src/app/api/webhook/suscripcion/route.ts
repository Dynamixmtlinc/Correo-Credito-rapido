import { NextRequest, NextResponse } from "next/server";
import { requireAuth, apiError } from "@/lib/api-helpers";
import {
  createMailSubscription,
  renewMailSubscription,
} from "@/lib/graph-app";

// POST — crear nueva suscripción al inbox de admin@dynamixmtl.com
export async function POST(_req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const appUrl = process.env.NEXTAUTH_URL;
  if (!appUrl) return apiError("NEXTAUTH_URL non configurée");
  if (!process.env.WEBHOOK_ADMIN_EMAIL) return apiError("WEBHOOK_ADMIN_EMAIL non configurée");
  if (!process.env.WEBHOOK_SECRET) return apiError("WEBHOOK_SECRET non configurée");

  const webhookUrl = `${appUrl}/api/webhook/correo`;
  const subscription = await createMailSubscription(webhookUrl);

  return NextResponse.json(subscription, { status: 201 });
}

// PATCH — renovar suscripción existente (llamar antes de que expire)
export async function PATCH(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => null);
  if (!body?.subscriptionId) return apiError("subscriptionId requis");

  const subscription = await renewMailSubscription(body.subscriptionId);
  return NextResponse.json(subscription);
}
