/**
 * Backfill: procesa los correos que ya estaban en el buzón antes de existir la
 * suscripción de Graph (que solo notifica correo NUEVO).
 * No envía ningún correo — solo registra las facturas.
 *
 * Uso: `backfill-courriels.mts [desde-ISO]` — con fecha, solo los correos recibidos a
 * partir de ella (para no reprocesar todo el histórico).
 */
import { procesarCertificat } from "./src/lib/procesar-certificat.js";
import { esAsuntoCertificat, esRemitenteAutorizado } from "./src/lib/ingesta-filtro.js";
import { prisma } from "./src/lib/prisma.js";

const TENANT = process.env.AZURE_AD_TENANT_ID!;
const CID = process.env.AZURE_AD_CLIENT_ID!;
const SECRET = process.env.AZURE_AD_CLIENT_SECRET!;
const MBX = process.env.WEBHOOK_ADMIN_EMAIL!;
const DESDE = process.argv[2] ? new Date(process.argv[2]) : null;
if (DESDE && isNaN(DESDE.getTime())) throw new Error(`Fecha inválida: ${process.argv[2]}`);

const tokRes = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: CID, client_secret: SECRET,
    scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
});
const { access_token } = await tokRes.json();
const g = async (u: string) => {
  const r = await fetch(`https://graph.microsoft.com/v1.0${u}`, { headers: { Authorization: `Bearer ${access_token}` } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

const qs = new URLSearchParams({ $top: "100", $select: "id,subject,from,receivedDateTime,hasAttachments" });
let url: string | null = `/users/${MBX}/messages?${qs}`;
const candidatos: any[] = [];
while (url) {
  const page: any = await g(url);
  for (const m of page.value) {
    const from = m.from?.emailAddress?.address?.toLowerCase();
    if (DESDE && new Date(m.receivedDateTime) < DESDE) continue;
    if (esRemitenteAutorizado(from) && esAsuntoCertificat(m.subject) && m.hasAttachments) candidatos.push(m);
  }
  url = page["@odata.nextLink"] ? page["@odata.nextLink"].replace("https://graph.microsoft.com/v1.0", "") : null;
}
console.log(`Certificats @csdm.qc.ca${DESDE ? ` desde ${DESDE.toISOString()}` : ""}: ${candidatos.length}\n`);

for (const m of candidatos) {
  const atts: any = await g(`/users/${MBX}/messages/${m.id}/attachments`);
  const pdf = atts.value.find((a: any) => a.contentType === "application/pdf" || a.name?.toLowerCase().endsWith(".pdf"));
  if (!pdf) { console.log(`— ${m.subject}: sin PDF, ignorado`); continue; }

  const r = await procesarCertificat(Buffer.from(pdf.contentBytes, "base64"), {
    pdfNombre: pdf.name, pdfContentType: pdf.contentType || "application/pdf",
    responsableEmail: m.from.emailAddress.address.toLowerCase(),
    fechaRecepcion: new Date(m.receivedDateTime),
  });
  console.log(r.ok
    ? `✓ ${r.nombreFactura} — ${r.creada ? "créée" : "mise à jour"}${r.warnings.length ? ` (${r.warnings.join("; ")})` : ""}`
    : `✗ ${m.subject}: ${r.errors.join("; ")}`);
}

console.log("\nfacturas en BD:", await prisma.factura.count());
await prisma.$disconnect();
