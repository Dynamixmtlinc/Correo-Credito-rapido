/**
 * Parser del PDF `CertificatCR.pdf` — "DEMANDE D'APPROBATION DE FACTURE".
 *
 * El PDF lo genera Chromium (HTML→PDF, `/Producer Skia/PDF`), así que trae capa de
 * texto y una maquetación estable: cada etiqueta está en una columna de x fija y su
 * valor va en la fila inmediatamente inferior, misma x.
 *
 * Se parsea por POSICIÓN, no por orden de líneas, porque cuando un campo viene vacío
 * (p. ej. ÉCOLE) su línea de valor **desaparece** del texto y un parser posicional por
 * índice se desalinearía en silencio.
 */

export interface AprobadorCertificat {
  rol: string;
  nombre?: string;
  fecha?: string; // texto tal cual del PDF ("8 juillet 2026")
  comentario?: string;
  estatus?: string;
}

export interface CertificatData {
  nombreFactura: string;
  projet?: string;
  fournisseur?: string;
  ecole?: string;
  indiceComptable?: string;
  agentAdministratif?: string;

  montantTotal?: number;
  montantAPayer?: number;

  dateFacture?: string; // YYYY-MM-DD
  dateSaisie?: string; // YYYY-MM-DD

  paiementRapide: boolean;
  fournisseurHomologue: boolean;
  exigeCredit: boolean;

  dossierUrl?: string;
  chaineApprobation: AprobadorCertificat[];
}

export type CertificatResult =
  | { ok: true; data: CertificatData; warnings: string[] }
  | { ok: false; data: null; errors: string[] };

// ─── Etiquetas conocidas ─────────────────────────────────────────────────────
// Se usan para dos cosas: localizar el valor debajo, y reconocer que la fila de
// abajo es OTRA etiqueta (⇒ el campo está vacío) en vez de tomarla como valor.

const LABEL_FACTURE = "N° DE FACTURE";
const LABEL_MONTANT_TOTAL = "MONTANT TOTAL (TAXES INCL.)";
const LABEL_MONTANT_PAYER = "MONTANT À PAYER (TAXES";
const LABEL_DATE_FACTURE = "DATE DE LA FACTURE";
const LABEL_DATE_SAISIE = "DATE DE LA SAISIE";
const LABEL_AGENT = "AGENT ADMINISTRATIF";
const LABEL_PAIEMENT_RAPIDE = "PAIEMENT RAPIDE";
const LABEL_PROJET = "PROJET";
const LABEL_HOMOLOGUE = "SRM / FOURNISSEUR HOMOLOGUÉ";
const LABEL_INDICE = "INDICE COMPTABLE";
const LABEL_ECOLE = "ÉCOLE";

const ETIQUETAS = new Set([
  LABEL_FACTURE,
  LABEL_MONTANT_TOTAL,
  LABEL_MONTANT_PAYER,
  LABEL_DATE_FACTURE,
  LABEL_DATE_SAISIE,
  LABEL_AGENT,
  LABEL_PAIEMENT_RAPIDE,
  LABEL_PROJET,
  LABEL_HOMOLOGUE,
  LABEL_INDICE,
  LABEL_ECOLE,
  "INCL.)", // continuación de LABEL_MONTANT_PAYER, que ocupa dos filas
  "DOSSIER",
  "CHAÎNE D'APPROBATION",
  "APPROBATEUR",
  "NOM, PRÉNOM",
  "DATE",
  "COMMENTAIRE",
  "STATUT",
]);

// Los roles son un conjunto cerrado. Anclarse en ellos es mucho más robusto que
// intentar deducir por geometría dónde empieza cada fila de la tabla, sobre todo
// porque "Direction adjointe de service" se parte en dos líneas.
const ROLES = [
  "Chargé de projet",
  "Régisseur",
  "Coordonnateur",
  "Direction adjointe de service",
  "Direction de service",
];

const MESES: Record<string, number> = {
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  decembre: 12,
};

interface Item {
  str: string;
  x: number;
  y: number;
}
interface Row {
  y: number;
  items: Item[];
}

/** "1 juillet 2026" → "2026-07-01" */
function parseFechaFrancesa(texto?: string): string | undefined {
  if (!texto) return undefined;
  const m = texto.match(/(\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4})/);
  if (!m) return undefined;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return undefined;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${String(Number(m[1])).padStart(2, "0")}`;
}

/**
 * "150 $" → 150 · "1 250,50 $" → 1250.5 · "$" → undefined
 * Formato francés: coma decimal y espacios (incluidos los no separables) como
 * separador de millares.
 */
function parseMonto(texto?: string): number | undefined {
  if (!texto) return undefined;
  const limpio = texto
    .replace(/[\s  ]/g, "")
    .replace(/\$/g, "")
    .replace(/,/g, ".");
  if (!limpio) return undefined;
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : undefined;
}

function esOui(texto?: string): boolean {
  return (texto ?? "").trim().toLowerCase().startsWith("oui");
}

/** Agrupa los items en filas, tolerando pequeñas diferencias de y. */
function construirFilas(items: Item[]): Row[] {
  const filas: Row[] = [];
  for (const item of items) {
    const fila = filas.find((f) => Math.abs(f.y - item.y) <= 3);
    if (fila) fila.items.push(item);
    else filas.push({ y: item.y, items: [item] });
  }
  for (const f of filas) f.items.sort((a, b) => a.x - b.x);
  // de arriba a abajo: en PDF la y crece hacia arriba
  return filas.sort((a, b) => b.y - a.y);
}

function esEtiqueta(str: string): boolean {
  return ETIQUETAS.has(str.trim());
}

/**
 * Devuelve el valor asociado a una etiqueta: el primer item que aparece por debajo
 * de ella en la misma columna. Si lo que hay debajo es otra etiqueta, el campo está
 * vacío y se devuelve undefined.
 */
function valorDe(filas: Row[], etiqueta: string, tolerancia = 12): string | undefined {
  const idx = filas.findIndex((f) => f.items.some((i) => i.str.trim() === etiqueta));
  if (idx === -1) return undefined;
  const label = filas[idx].items.find((i) => i.str.trim() === etiqueta)!;

  // Todos los campos de cabecera están por encima de la tabla de aprobación. Acotar
  // ahí evita que un campo vacío se "coma" por error un valor de la tabla que
  // casualmente caiga en la misma columna.
  const limite = filas.findIndex((f) =>
    f.items.some((i) => i.str.trim() === "CHAÎNE D'APPROBATION")
  );
  const fin = limite === -1 ? filas.length : limite;

  for (let k = idx + 1; k < fin; k++) {
    // Solo importa lo que haya en ESTA columna. Que otra columna arranque una
    // sección nueva (p. ej. la continuación "INCL.)" del montant à payer) no dice
    // nada sobre este campo.
    const candidato = filas[k].items.find((i) => Math.abs(i.x - label.x) <= tolerancia);
    if (!candidato) continue;

    // Continuación de la propia etiqueta → seguir bajando.
    if (candidato.str.trim() === "INCL.)") continue;
    // Otra etiqueta en la misma columna ⇒ este campo viene vacío.
    if (esEtiqueta(candidato.str)) return undefined;

    return candidato.str.trim();
  }
  return undefined;
}

/** Extrae la tabla CHAÎNE D'APPROBATION anclándose en los roles conocidos. */
function extraerCadena(filas: Row[]): AprobadorCertificat[] {
  const idxTabla = filas.findIndex((f) =>
    f.items.some((i) => i.str.trim() === "CHAÎNE D'APPROBATION")
  );
  if (idxTabla === -1) return [];

  const cuerpo = filas.slice(idxTabla + 1);
  const resultado: AprobadorCertificat[] = [];
  let actual: AprobadorCertificat | null = null;
  let textoRol = "";

  for (const fila of cuerpo) {
    const colRol = fila.items.filter((i) => i.x < 150);
    const colNombre = fila.items.filter((i) => i.x >= 150 && i.x < 260);
    const colFecha = fila.items.filter((i) => i.x >= 260 && i.x < 320);
    const colComentario = fila.items.filter((i) => i.x >= 320 && i.x < 460);
    const colEstatus = fila.items.filter((i) => i.x >= 460);

    if (colRol.length > 0) {
      const texto = colRol.map((i) => i.str.trim()).join(" ");
      if (esEtiqueta(texto)) continue; // fila de cabecera

      const candidato = textoRol ? `${textoRol} ${texto}` : texto;
      const rolExacto = ROLES.find((r) => r === candidato);

      if (rolExacto) {
        // Rol completo (posiblemente reconstruido de dos líneas)
        actual = { rol: rolExacto };
        resultado.push(actual);
        textoRol = "";
      } else if (ROLES.some((r) => r.startsWith(candidato))) {
        // Prefijo de un rol que continúa en la línea siguiente
        textoRol = candidato;
        continue;
      } else {
        textoRol = "";
        continue;
      }
    }

    if (!actual) continue;

    const añadir = (previo: string | undefined, items: Item[]) => {
      if (items.length === 0) return previo;
      const texto = items.map((i) => i.str.trim()).join(" ");
      return previo ? `${previo} ${texto}` : texto;
    };

    actual.nombre = añadir(actual.nombre, colNombre);
    actual.fecha = añadir(actual.fecha, colFecha);
    actual.comentario = añadir(actual.comentario, colComentario);
    actual.estatus = añadir(actual.estatus, colEstatus);
  }

  return resultado;
}

export async function parseCertificat(buffer: Buffer): Promise<CertificatResult> {
  let items: Item[];
  let dossierUrl: string | undefined;

  try {
    // Import dinámico: pdfjs es ESM y pesado, solo se carga al procesar un correo.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    }).promise;

    const page = await doc.getPage(1);
    const contenido = await page.getTextContent();

    items = contenido.items
      .filter((i): i is typeof i & { str: string; transform: number[] } => "str" in i)
      .filter((i) => i.str.trim().length > 0)
      .map((i) => ({
        str: i.str.trim(),
        x: Math.round(i.transform[4]),
        y: Math.round(i.transform[5]),
      }));

    // El enlace al dossier de SharePoint vive en una anotación, no en el texto.
    const anotaciones = await page.getAnnotations();
    dossierUrl = anotaciones.find((a) => typeof a.url === "string" && a.url)?.url;
  } catch (e) {
    return {
      ok: false,
      data: null,
      errors: [`PDF illisible: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (items.length === 0) {
    return { ok: false, data: null, errors: ["PDF sans couche de texte (probablement scanné)"] };
  }

  const filas = construirFilas(items);
  const errors: string[] = [];
  const warnings: string[] = [];

  const nombreFactura = valorDe(filas, LABEL_FACTURE);
  if (!nombreFactura) {
    errors.push("N° DE FACTURE introuvable dans le PDF");
  }

  // "Fournisseur : X" — etiqueta y valor van en la MISMA fila, no debajo.
  let fournisseur: string | undefined;
  const filaFournisseur = filas.find((f) =>
    f.items.some((i) => i.str.trim().startsWith("Fournisseur :"))
  );
  if (filaFournisseur) {
    const partes = filaFournisseur.items.map((i) => i.str.trim());
    const texto = partes.join(" ").replace(/^Fournisseur\s*:\s*/, "").trim();
    // En las muestras de prueba viene como "." ⇒ tratarlo como vacío.
    if (texto && texto !== ".") fournisseur = texto;
  }

  const exigeCredit = filas.some((f) =>
    f.items.some((i) => i.str.replace(/\s+/g, "").toUpperCase().includes("EXIGECRÉDIT"))
  );

  if (errors.length > 0) {
    return { ok: false, data: null, errors };
  }

  const montantTotal = parseMonto(valorDe(filas, LABEL_MONTANT_TOTAL));
  const dateFacture = parseFechaFrancesa(valorDe(filas, LABEL_DATE_FACTURE));

  if (montantTotal === undefined) warnings.push("MONTANT TOTAL absent ou illisible");
  if (!dateFacture) warnings.push("DATE DE LA FACTURE absente ou illisible");
  if (!fournisseur) warnings.push("Fournisseur absent dans le PDF");

  return {
    ok: true,
    warnings,
    data: {
      nombreFactura: nombreFactura!,
      projet: valorDe(filas, LABEL_PROJET),
      fournisseur,
      ecole: valorDe(filas, LABEL_ECOLE),
      indiceComptable: valorDe(filas, LABEL_INDICE),
      agentAdministratif: valorDe(filas, LABEL_AGENT),
      montantTotal,
      montantAPayer: parseMonto(valorDe(filas, LABEL_MONTANT_PAYER)),
      dateFacture,
      dateSaisie: parseFechaFrancesa(valorDe(filas, LABEL_DATE_SAISIE)),
      paiementRapide: esOui(valorDe(filas, LABEL_PAIEMENT_RAPIDE)),
      fournisseurHomologue: esOui(valorDe(filas, LABEL_HOMOLOGUE)),
      exigeCredit,
      dossierUrl,
      chaineApprobation: extraerCadena(filas),
    },
  };
}
