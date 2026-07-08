export interface ParsedFacturaEmail {
  nombreFactura: string;
  noProjet: string;
  ecoleName: string;
  fournisseurName: string;
  montant: number;
  dateFacture: string; // YYYY-MM-DD

  srmProjet?: string;
  dateLimite?: string;
  indiceComptable?: string;
  affectationCredit?: string;

  cpEmail?: string;
  regisseurEmail?: string;
  coordoEmail?: string;
  dirAdjointeEmail?: string;
  directionGeneraleEmail?: string;
  cooEmail?: string;

  repartitionRequise: boolean;
  raisonSocialConforme: boolean;
  dixPourcentVerifier: boolean;
  fourHomologue: boolean;
  paimentRapide: boolean;
  affectationCreditCheck: boolean;

  commentairesResponsable?: string;
}

export type ParseResult =
  | { ok: true; data: ParsedFacturaEmail; errors: string[] }
  | { ok: false; data: null; errors: string[] };

// Extrae el valor de un campo "CLAVE: valor" (insensible a mayúsculas)
function field(body: string, key: string): string | undefined {
  const match = body.match(new RegExp(`^${key}:\\s*(.+)$`, "im"));
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : undefined;
}

// Lee un campo booleano: "oui" / "yes" / "true" → true
function bool(body: string, key: string): boolean {
  const val = field(body, key)?.toLowerCase();
  return val === "oui" || val === "yes" || val === "true";
}

// Extrae el bloque de texto libre después de "COMMENTAIRES:"
function extractCommentaires(body: string): string | undefined {
  const match = body.match(/^COMMENTAIRES:\s*\n([\s\S]+?)(?:\n{2,}|$)/im);
  return match?.[1]?.trim() || undefined;
}

// Convierte HTML básico a texto plano para facilitar el parsing
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<div[^>]*>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

export function parseFacturaEmail(
  _subject: string,
  bodyContent: string,
  contentType: string
): ParseResult {
  const errors: string[] = [];
  const body = contentType.toLowerCase().includes("html")
    ? stripHtml(bodyContent)
    : bodyContent;

  const nombreFactura = field(body, "FACTURE");
  if (!nombreFactura) errors.push("Campo FACTURE obligatoire");

  const noProjet = field(body, "PROJET");
  if (!noProjet) errors.push("Campo PROJET obligatoire");

  const ecoleName = field(body, "ECOLE");
  if (!ecoleName) errors.push("Campo ECOLE obligatoire");

  const fournisseurName = field(body, "FOURNISSEUR");
  if (!fournisseurName) errors.push("Campo FOURNISSEUR obligatoire");

  const montantRaw = field(body, "MONTANT");
  const montant = montantRaw ? parseFloat(montantRaw.replace(",", ".")) : NaN;
  if (!montantRaw || isNaN(montant) || montant <= 0) {
    errors.push("Campo MONTANT invalide ou manquant (ex: 1250.00)");
  }

  const dateFacture = field(body, "DATE_FACTURE");
  if (!dateFacture || !/^\d{4}-\d{2}-\d{2}$/.test(dateFacture)) {
    errors.push("Campo DATE_FACTURE obligatoire au format YYYY-MM-DD");
  }

  if (errors.length > 0) {
    return { ok: false, data: null, errors };
  }

  return {
    ok: true,
    errors: [],
    data: {
      nombreFactura: nombreFactura!,
      noProjet: noProjet!,
      ecoleName: ecoleName!,
      fournisseurName: fournisseurName!,
      montant,
      dateFacture: dateFacture!,
      srmProjet: field(body, "SRM"),
      dateLimite: field(body, "DATE_LIMITE"),
      indiceComptable: field(body, "INDICE_COMPTABLE"),
      affectationCredit: field(body, "AFFECTATION_CREDIT"),
      cpEmail: field(body, "CP"),
      regisseurEmail: field(body, "REGISSEUR"),
      coordoEmail: field(body, "COORDO"),
      dirAdjointeEmail: field(body, "DIR_ADJ"),
      directionGeneraleEmail: field(body, "DIR_GEN"),
      cooEmail: field(body, "COO"),
      repartitionRequise: bool(body, "REPARTITION_REQUISE"),
      raisonSocialConforme: bool(body, "RAISON_SOCIALE_CONFORME"),
      dixPourcentVerifier: bool(body, "DIX_POURCENT"),
      fourHomologue: bool(body, "FOUR_HOMOLOGUE"),
      paimentRapide: bool(body, "PAIEMENT_RAPIDE"),
      affectationCreditCheck: bool(body, "AFFECTATION_CREDIT_CHECK"),
      commentairesResponsable: extractCommentaires(body),
    },
  };
}
