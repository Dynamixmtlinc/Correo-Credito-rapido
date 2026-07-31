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
  const comentario =
    typeof body?.comentario === "string" ? body.comentario.trim() : undefined;

  if (decision !== "APPROUVE" && decision !== "REFUSE") {
    return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
  }

  // Un refus sin motif no le sirve a nadie aguas abajo.
  if (decision === "REFUSE" && !comentario) {
    return NextResponse.json(
      { error: "Un commentaire est obligatoire pour refuser la facture" },
      { status: 400 }
    );
  }

  const factura = await prisma.factura.findFirst({
    where: { nombreFactura: numero },
    select: {
      id: true,
      nombreFactura: true,
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
    comentario,
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
    subject: `[RÉPONSE ${decision === "APPROUVE" ? "APPROUVÉE" : "REFUSÉE"}] Facture ${factura.nombreFactura}`,
    bodyHtml: buildReponseHtml({
      nombreFactura: factura.nombreFactura,
      noProjet: factura.noProjet,
      montant: formatMonto(Number(factura.montant)),
      approuve: decision === "APPROUVE",
      comentario,
      dateReponse: new Date(),
    }),
  }).catch((e) => console.error("[facture/repondre] envoi courriel:", e));

  return NextResponse.json({ ok: true });
}

function buildReponseHtml(p: {
  nombreFactura: string;
  noProjet: string;
  montant: string;
  approuve: boolean;
  comentario?: string;
  dateReponse: Date;
}): string {
  const color = p.approuve ? "#16a34a" : "#dc2626";
  const label = p.approuve ? "approuvée" : "refusée";

  const ligne = (etiquette: string, valeur: string) => `
    <tr>
      <td style="padding:6px 16px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap">${etiquette}</td>
      <td style="padding:6px 0;font-size:13px;color:#111827">${valeur}</td>
    </tr>`;

  return `
    <p>Le fournisseur a <strong style="color:${color}">${label}</strong> la facture
    <strong>${escapeHtml(p.nombreFactura)}</strong>.</p>
    <table style="border-collapse:collapse;margin:12px 0">
      ${ligne("N° de facture", `<strong>${escapeHtml(p.nombreFactura)}</strong>`)}
      ${ligne("Réponse", `<strong style="color:${color}">${p.approuve ? "Approuvée" : "Refusée"}</strong>`)}
      ${ligne("Date de la réponse", escapeHtml(formatDateHeure(p.dateReponse)))}
      ${ligne("Projet", escapeHtml(p.noProjet) || "—")}
      ${ligne("Montant", escapeHtml(p.montant))}
      ${ligne(
        "Commentaire",
        p.comentario
          ? escapeHtml(p.comentario).replace(/\n/g, "<br/>")
          : `<span style="color:#9ca3af">Aucun commentaire</span>`
      )}
    </table>
    <hr/>
    <p style="font-size:12px;color:#6b7280">Système d'approbation de factures</p>
  `;
}

/** El comentario lo escribe un tercero sin sesión: nunca se interpola en crudo. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
