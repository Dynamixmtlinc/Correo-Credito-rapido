/**
 * Renueva (o recrea) la suscripción de Microsoft Graph al buzón de admin.
 *
 * Las suscripciones a correo duran ~4230 min (~3 días). Sin renovarlas, la
 * ingesta de facturas se apaga sola y en silencio.
 *
 * Es **autocurativo**: si la suscripción ya expiró o no existe, la crea de nuevo
 * en vez de fallar. Así un corte de un par de días se arregla en la ejecución
 * siguiente sin intervención manual.
 *
 * Variables requeridas (las inyecta el workflow desde los app settings):
 *   AZURE_AD_TENANT_ID, AZURE_AD_CLIENT_ID, AZURE_AD_CLIENT_SECRET,
 *   WEBHOOK_ADMIN_EMAIL, WEBHOOK_SECRET, NEXTAUTH_URL
 */

const {
  AZURE_AD_TENANT_ID: TENANT,
  AZURE_AD_CLIENT_ID: CLIENT_ID,
  AZURE_AD_CLIENT_SECRET: CLIENT_SECRET,
  WEBHOOK_ADMIN_EMAIL: MAILBOX,
  WEBHOOK_SECRET: SECRET,
  NEXTAUTH_URL: APP_URL,
} = process.env;

const manquantes = Object.entries({
  AZURE_AD_TENANT_ID: TENANT,
  AZURE_AD_CLIENT_ID: CLIENT_ID,
  AZURE_AD_CLIENT_SECRET: CLIENT_SECRET,
  WEBHOOK_ADMIN_EMAIL: MAILBOX,
  WEBHOOK_SECRET: SECRET,
  NEXTAUTH_URL: APP_URL,
})
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (manquantes.length) {
  console.error(`Variables manquantes : ${manquantes.join(", ")}`);
  process.exit(1);
}

const WEBHOOK_URL = `${APP_URL.replace(/\/$/, "")}/api/webhook/correo`;
const RESOURCE = `users/${MAILBOX}/mailFolders/inbox/messages`;
// Margen bajo el máximo de Graph (4230 min) para absorber desfases de reloj.
const DUREE_MIN = 4200;

function expiration() {
  return new Date(Date.now() + DUREE_MIN * 60_000).toISOString();
}

async function jeton() {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) throw new Error(`Jeton refusé : ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function graph(token, chemin, init = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${chemin}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${chemin} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const token = await jeton();

const { value: souscriptions } = await graph(token, "/subscriptions");
const nôtres = souscriptions.filter((s) => s.notificationUrl === WEBHOOK_URL);

if (nôtres.length === 0) {
  console.log("Aucune souscription active — création.");
  const créée = await graph(token, "/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      changeType: "created",
      notificationUrl: WEBHOOK_URL,
      resource: RESOURCE,
      expirationDateTime: expiration(),
      clientState: SECRET,
    }),
  });
  console.log(`✓ Créée ${créée.id} — expire ${créée.expirationDateTime}`);
} else {
  const [active, ...doublons] = nôtres;

  const maj = await graph(token, `/subscriptions/${active.id}`, {
    method: "PATCH",
    body: JSON.stringify({ expirationDateTime: expiration() }),
  });
  console.log(`✓ Renouvelée ${active.id} — expire ${maj.expirationDateTime}`);

  // Plusieurs souscriptions sur le même webhook feraient traiter chaque courriel
  // en double : on ne garde que la première.
  for (const s of doublons) {
    await graph(token, `/subscriptions/${s.id}`, { method: "DELETE" });
    console.log(`— Doublon supprimé ${s.id}`);
  }
}
