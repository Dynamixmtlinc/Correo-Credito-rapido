import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarRespuestaFournisseur } from "@/lib/procesar-certificat";
import { sendAdminEmail } from "@/lib/graph-app";
import { formatMonto, formatDateHeure } from "@/lib/utils";
import { delaiReponse } from "@/lib/delai-reponse";

/**
 * Respuesta del proveedor. **Ruta pública sin sesión**: la URL es deducible a
 * propósito, para que acostasalcedo pueda construirla a mano.
 *
 * Compensaciones ante esa exposición:
 *  - una sola respuesta por factura (la segunda se rechaza);
 *  - se guarda la IP de origen como rastro;
 *  - no se devuelve ningún dato de la factura en la respuesta.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ numero: string }> }
) {
  const { numero } = await params;

  const body = await req.json().catch(() => null);
  const decision = body?.decision;

  if (decision !== "APPROUVE" && decision !== "REFUSE") {
    return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
  }

  // El proveedor ya no escribe comentario (cliente, 2026-09-08): la respuesta es solo
  // «J'accepte» / «Je conteste». Con ello cae la exigencia de motivo para contestar, que
  // era una de las compensaciones ante la URL adivinable. Si el cuerpo trae `comentario`
  // —una llamada directa a esta ruta pública—, **se ignora**: no se guarda ni se envía.

  const factura = await prisma.factura.findFirst({
    where: { nombreFactura: numero },
    select: {
      id: true,
      nombreFactura: true,
      idFactura: true,
      noProjet: true,
      montant: true,
      responsableEmail: true,
      createdAt: true,
    },
  });

  if (!factura) {
    return NextResponse.json({ error: "Facture introuvable" }, { status: 404 });
  }

  // El plazo se comprueba **aquí**, no solo en la página: la ruta es pública y nada
  // impide llamarla directamente cuando la UI ya no muestra el formulario.
  const delai = delaiReponse(factura.createdAt);
  if (delai.expire) {
    return NextResponse.json(
      {
        error: `Le délai de réponse a expiré le ${formatDateHeure(delai.limite)}. Il n'est plus possible de répondre à cette facture.`,
      },
      { status: 410 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined;

  const resultado = await registrarRespuestaFournisseur({
    facturaId: factura.id,
    decision,
    ip,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { error: "Cette facture a déjà reçu une réponse" },
      { status: 409 }
    );
  }

  // Único correo que emite el sistema: avisar al responsable de que ya hay
  // respuesta. Él decide a quién reenviarlo. No debe tumbar la respuesta si falla.
  sendAdminEmail({
    to: [factura.responsableEmail],
    subject: `[${decision === "APPROUVE" ? "J'ACCEPTE" : "JE CONTESTE"}] Facture ${factura.nombreFactura}`,
    bodyHtml: buildReponseHtml({
      nombreFactura: factura.nombreFactura,
      idFactura: factura.idFactura,
      noProjet: factura.noProjet,
      montant: formatMonto(Number(factura.montant)),
      approuve: decision === "APPROUVE",
      dateReponse: new Date(),
    }),
  }).catch((e) => console.error("[facture/repondre] envoi courriel:", e));

  return NextResponse.json({ ok: true });
}

function buildReponseHtml(p: {
  nombreFactura: string;
  idFactura: string | null;
  noProjet: string;
  montant: string;
  approuve: boolean;
  dateReponse: Date;
}): string {
  // El correo usa **exactamente** la misma etiqueta que ve el proveedor en la página
  // («J'accepte» / «Je conteste»), no una variante conjugada: quien lee el correo debe
  // reconocer al instante qué botón se pulsó. El enum de la base sigue siendo
  // APPROUVE/REFUSE. Cliente, 2026-07-31.
  const color = p.approuve ? "#16a34a" : "#dc2626";
  const reponse = p.approuve ? "J'accepte" : "Je conteste";

  const ligne = (etiquette: string, valeur: string) => `
    <tr>
      <td style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap">${etiquette}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827">${valeur}</td>
    </tr>`;

  return `
    <p>Le fournisseur a répondu à la facture
    <strong>${escapeHtml(p.nombreFactura)}</strong> :
    <strong style="color:${color}">${escapeHtml(reponse)}</strong>.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      ${/* «ID Facture», no «N° de facture»: son dos cosas distintas y el cliente pidió
           separarlas para que nadie las confunda (2026-09-08). Aquí va el ID que el
           certificat imprime en su línea «ID: …»; el n° de factura sigue siendo lo que
           ve el proveedor en la página, y se lee arriba en la frase de apertura y en el
           asunto. Sin ID —certificat del formato viejo— la fila queda vacía en vez de
           rellenarse con el n° de factura, que es justo la confusión a evitar. */ ""}
      ${ligne(
        "ID Facture",
        p.idFactura ? `<strong>${escapeHtml(p.idFactura)}</strong>` : ""
      )}
      ${ligne("Réponse", `<strong style="color:${color}">${escapeHtml(reponse)}</strong>`)}
      ${ligne("Date de la réponse", escapeHtml(formatDateHeure(p.dateReponse)))}
      ${ligne("Projet", escapeHtml(p.noProjet) || "—")}
      ${ligne("Montant", escapeHtml(p.montant))}
    </table>
    <hr/>
    <p style="font-size:12px;color:#6b7280">Système d'approbation de factures</p>
  `;
}

/** El n° de factura y el n° de projet vienen del PDF: nunca se interpolan en crudo. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
