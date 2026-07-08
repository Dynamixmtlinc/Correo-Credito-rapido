// Microsoft Graph API — app-only auth (client credentials)
// Requiere permiso de aplicación Mail.Read en Azure AD (no delegado)

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function getAppToken(): Promise<string> {
  const tenantId = process.env.AZURE_AD_TENANT_ID!;
  const clientId = process.env.AZURE_AD_CLIENT_ID!;
  const clientSecret = process.env.AZURE_AD_CLIENT_SECRET!;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Error al obtener app token: ${err}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

async function graphAppFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAppToken();
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Graph API error ${res.status}: ${error}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface GraphMessage {
  id: string;
  subject: string;
  from: { emailAddress: { address: string; name: string } };
  body: { contentType: string; content: string };
  receivedDateTime: string;
  hasAttachments: boolean;
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes: string; // base64
}

export interface GraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  expirationDateTime: string;
  clientState: string;
}

// Leer un mensaje del buzón de la cuenta admin
export async function getAdminMessage(messageId: string): Promise<GraphMessage> {
  const adminEmail = process.env.WEBHOOK_ADMIN_EMAIL!;
  return graphAppFetch<GraphMessage>(
    `/users/${adminEmail}/messages/${messageId}?$select=id,subject,from,body,receivedDateTime,hasAttachments`
  );
}

// Obtener adjuntos de un mensaje
export async function getMessageAttachments(messageId: string): Promise<GraphAttachment[]> {
  const adminEmail = process.env.WEBHOOK_ADMIN_EMAIL!;
  const data = await graphAppFetch<{ value: GraphAttachment[] }>(
    `/users/${adminEmail}/messages/${messageId}/attachments`
  );
  return data.value ?? [];
}

// Crear suscripción al inbox de la cuenta admin
export async function createMailSubscription(
  webhookUrl: string
): Promise<GraphSubscription> {
  const adminEmail = process.env.WEBHOOK_ADMIN_EMAIL!;
  const secret = process.env.WEBHOOK_SECRET!;

  // Graph permite máximo ~4230 minutos (~3 días) para Mail.Read de aplicación
  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + 4230);

  return graphAppFetch<GraphSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: webhookUrl,
      resource: `users/${adminEmail}/mailFolders/inbox/messages`,
      expirationDateTime: expiresOn.toISOString(),
      clientState: secret,
    }),
  });
}

// Renovar suscripción antes de que expire
export async function renewMailSubscription(
  subscriptionId: string
): Promise<GraphSubscription> {
  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + 4230);

  return graphAppFetch<GraphSubscription>(`/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: JSON.stringify({ expirationDateTime: expiresOn.toISOString() }),
  });
}

// Enviar correo desde la cuenta admin (respuesta automática al remitente)
export async function sendAdminEmail(payload: {
  to: string[];
  subject: string;
  bodyHtml: string;
}): Promise<void> {
  const adminEmail = process.env.WEBHOOK_ADMIN_EMAIL!;
  await graphAppFetch<void>(`/users/${adminEmail}/sendMail`, {
    method: "POST",
    body: JSON.stringify({
      message: {
        subject: payload.subject,
        body: { contentType: "HTML", content: payload.bodyHtml },
        toRecipients: payload.to.map((email) => ({
          emailAddress: { address: email },
        })),
      },
      saveToSentItems: true,
    }),
  });
}
