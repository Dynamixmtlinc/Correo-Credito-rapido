/**
 * Qué correos del buzón admin entran en la ingesta.
 *
 * Compartido por el webhook y por el backfill para que los dos decidan igual.
 */

/**
 * Dominio autorizado. Hasta el 2026-10-06 solo se aceptaba a acostasalcedo; desde
 * entonces envían certificats otras personas de la CSDM (pageau.v, recuerda.m) y el
 * cliente pidió aceptar todo el dominio.
 */
const DOMINIO_AUTORIZADO = "csdm.qc.ca";

/** Dominio exacto: `x@csdm.qc.ca` sí; `x@evil-csdm.qc.ca` y `x@csdm.qc.ca.evil.com` no. */
export function esRemitenteAutorizado(email: string | undefined | null): boolean {
  const dominio = email?.trim().toLowerCase().split("@").pop();
  return dominio === DOMINIO_AUTORIZADO;
}

/**
 * Solo los correos cuyo asunto empieza por `SRM_Projet` traen un certificat (cliente,
 * 2026-10-08). Con todo el dominio autorizado llegan también otros correos con PDF (p. ej.
 * la correspondencia del registro de fournisseurs de pageau.v): sin este filtro cada uno
 * dispararía un `[ERREUR]` al remitente.
 *
 * Los asuntos reales dicen `SRM_Projet` (francés); se acepta también `SRM_Project` por si
 * la plantilla de Power Automate cambia de grafía.
 */
export function esAsuntoCertificat(asunto: string | undefined | null): boolean {
  return /^srm_proje(c)?t/i.test((asunto ?? "").trim());
}
