import { prisma } from "@/lib/prisma";
import { formatMonto, formatDate, formatDateHeure, numerosDesdeRuta } from "@/lib/utils";
import { ROL_FOURNISSEUR } from "@/lib/procesar-certificat";
import { delaiReponse, JOURS_POUR_REPONDRE } from "@/lib/delai-reponse";
import { whereCertificat } from "@/lib/db-storage";
import { ReponseForm } from "./ReponseForm";
import { FileText, Clock, Check, X, CalendarX, ExternalLink } from "lucide-react";

// Ruta pública sin sesión: la URL la construye a mano el responsable.
export const dynamic = "force-dynamic";

export default async function FacturePubliquePage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const { numero } = await params;

  const factura = await prisma.factura.findFirst({
    where: { nombreFactura: { in: numerosDesdeRuta(numero) } },
    include: {
      ecole: { select: { nombre: true } },
      fournisseur: { select: { nombre: true } },
      historialAprobacion: {
        where: { rolAprobador: ROL_FOURNISSEUR },
        select: { decision: true, comentario: true, createdAt: true },
        take: 1,
      },
    },
  });

  // El responsable puede enviar el enlace antes de que el courriel se procese.
  // Es un caso normal, no un error: se explica en vez de dar un 404 seco.
  if (!factura) {
    const affiche = numerosDesdeRuta(numero)[0];
    return (
      <Shell titre={affiche}>
        <div className="text-center py-10">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800">
            Facture pas encore disponible
          </h2>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            La facture <strong>{affiche}</strong> n&apos;est pas encore enregistrée dans
            le système. Elle le sera sous peu — veuillez réessayer dans quelques
            minutes en rechargeant cette page.
          </p>
        </div>
      </Shell>
    );
  }

  // Solo se comprueba que exista: el PDF lo sirve `api/facture/[numero]/certificat`.
  const certificat = await prisma.documento.findFirst({
    where: whereCertificat([factura.nombreFactura]),
    select: { id: true },
  });

  const respuesta = factura.historialAprobacion[0] ?? null;
  // El plazo corre desde que se procesó el correo y no se mueve aunque la factura
  // se actualice después. Ver `src/lib/delai-reponse.ts`.
  const delai = delaiReponse(factura.createdAt);

  return (
    <Shell titre={factura.nombreFactura}>
      {/* Cabecera con los importes */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 mb-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <Champ label="N° de facture" valeur={factura.nombreFactura} accent />
          <Champ
            label="Montant total (taxes incl.)"
            valeur={formatMonto(Number(factura.montant))}
            accent
          />
          <Champ label="Projet" valeur={factura.noProjet || "—"} />
        </div>
      </div>

      {/* Datos de la factura.
          El proveedor ve SOLO 7 campos (decisión del cliente, 2026-09-03): los 3 de la
          cabecera + estos 4. Todo lo interno (agent administratif, indice comptable,
          paiement rapide, fournisseur homologué y la chaîne d'approbation) queda fuera. */}
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 mb-6">
        <Champ label="Date de la facture" valeur={formatDate(factura.dateFacture)} />
        {/* `dateSaisie` viene del PDF («Date de saisie»); para el proveedor se
            enuncia como la fecha en que la CSDM recibió la factura. */}
        <Champ label="Date de réception" valeur={formatDate(factura.dateSaisie)} />
        <Champ label="Fournisseur" valeur={factura.fournisseur?.nombre ?? "—"} />
        <Champ label="École" valeur={factura.ecole?.nombre ?? "—"} />
      </div>

      {certificat && (
        <Certificat
          url={`/api/facture/${encodeURIComponent(factura.nombreFactura)}/certificat`}
        />
      )}

      {/* Respuesta */}
      <div className="mt-8 pt-6 border-t">
        {respuesta ? (
          <ReponseDeja respuesta={respuesta} />
        ) : delai.expire ? (
          <DelaiExpire limite={delai.limite} />
        ) : (
          <ReponseForm
            numero={factura.nombreFactura}
            dateLimite={formatDateHeure(delai.limite)}
            joursRestants={delai.joursRestants}
          />
        )}
      </div>
    </Shell>
  );
}

function Shell({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-csdm-blue/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-csdm-blue" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-csdm-dark leading-tight">
              Demande d&apos;approbation de facture
            </h1>
            <p className="text-sm text-gray-500">{titre}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {children}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Système d&apos;approbation de factures
        </p>
      </div>
    </div>
  );
}

function Champ({
  label,
  valeur,
  accent,
}: {
  label: string;
  valeur: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500 font-medium">
        {label}
      </dt>
      <dd
        className={
          accent
            ? "text-lg font-bold text-csdm-dark mt-0.5"
            : "text-sm text-gray-800 mt-0.5"
        }
      >
        {valeur}
      </dd>
    </div>
  );
}

/**
 * El `CertificatCR.pdf` que llegó por correo, tal cual (usuario, 2026-10-08). Vista
 * previa embebida + enlace para abrirlo aparte: en móvil el visor embebido suele
 * mostrar solo la primera página, o nada.
 */
function Certificat({ url }: { url: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Certificat de la facture
        </h2>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-csdm-blue hover:underline"
        >
          Ouvrir le PDF
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      <iframe
        src={url}
        title="Certificat de la facture"
        className="w-full h-[70vh] min-h-[420px] rounded-lg border border-gray-200 bg-gray-50"
      />
    </div>
  );
}

/**
 * El enlace sigue mostrando la factura cuando el plazo vence — se explica el porqué en vez
 * de esconderla, pero sin formulario. El corte real está en la API, no aquí.
 */
function DelaiExpire({ limite }: { limite: Date }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-center gap-2">
        <CalendarX className="w-5 h-5 text-amber-600" />
        <h2 className="font-semibold text-amber-900">Délai de réponse expiré</h2>
      </div>
      <p className="text-sm text-amber-800 mt-2">
        Le délai de {JOURS_POUR_REPONDRE} jours pour répondre à cette facture a expiré le{" "}
        <strong>{formatDateHeure(limite)}</strong>. Il n&apos;est plus possible
        d&apos;envoyer une réponse par ce lien.
      </p>
      <p className="text-sm text-amber-800 mt-2">
        Veuillez communiquer avec la personne qui vous a transmis ce lien.
      </p>
    </div>
  );
}

function ReponseDeja({
  respuesta,
}: {
  respuesta: { decision: string; comentario: string | null; createdAt: Date };
}) {
  const approuve = respuesta.decision === "APPROUVE";
  return (
    <div
      className={`rounded-lg border p-5 ${
        approuve ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
      }`}
    >
      <div className="flex items-center gap-2">
        {approuve ? (
          <Check className="w-5 h-5 text-green-600" />
        ) : (
          <X className="w-5 h-5 text-red-600" />
        )}
        <h2
          className={`font-semibold ${approuve ? "text-green-800" : "text-red-800"}`}
        >
          Facture {approuve ? "acceptée" : "contestée"}
        </h2>
      </div>
      <p className="text-sm text-gray-600 mt-2">
        Réponse enregistrée le {formatDate(respuesta.createdAt)}. Une facture ne peut
        être répondue qu&apos;une seule fois.
      </p>
      {respuesta.comentario && (
        <p className="text-sm text-gray-800 mt-3 bg-white/70 rounded p-3 border">
          {respuesta.comentario}
        </p>
      )}
    </div>
  );
}
