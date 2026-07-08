// Microsoft Graph API client
// Usa el access token del usuario autenticado (NextAuth session)

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

async function graphFetch<T>(
  path: string,
  accessToken: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

export interface GraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
}

// Buscar usuarios en el directorio
export async function searchUsers(
  query: string,
  accessToken: string
): Promise<GraphUser[]> {
  const encoded = encodeURIComponent(query);
  const data = await graphFetch<{ value: GraphUser[] }>(
    `/users?$search="displayName:${encoded}" OR "mail:${encoded}"&$select=id,displayName,mail,userPrincipalName,jobTitle&$top=10`,
    accessToken,
    { headers: { ConsistencyLevel: "eventual" } }
  );
  return data.value ?? [];
}

// Obtener perfil del usuario actual
export async function getMyProfile(accessToken: string): Promise<GraphUser> {
  return graphFetch<GraphUser>(
    "/me?$select=id,displayName,mail,userPrincipalName,jobTitle",
    accessToken
  );
}

// Obtener foto del usuario como base64
export async function getUserPhoto(
  userIdOrEmail: string,
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/users/${userIdOrEmail}/photo/$value`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}

export interface SendMailPayload {
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
  from?: string;
}

// Enviar email vía Graph API
export async function sendEmail(
  payload: SendMailPayload,
  accessToken: string
): Promise<void> {
  const message = {
    subject: payload.subject,
    body: { contentType: "HTML", content: payload.bodyHtml },
    toRecipients: payload.to.map((email) => ({
      emailAddress: { address: email },
    })),
    ccRecipients: (payload.cc ?? []).map((email) => ({
      emailAddress: { address: email },
    })),
  };

  await graphFetch<void>("/me/sendMail", accessToken, {
    method: "POST",
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
}
