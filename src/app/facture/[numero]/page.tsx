import { prisma } from "@/lib/prisma";
import { formatMonto, formatDate } from "@/lib/utils";
import { ROL_FOURNISSEUR } from "@/lib/procesar-certificat";
import { ReponseForm } from "./ReponseForm";
import { FileText, Clock, Check, X } from "lucide-react";

// Ruta pública sin sesión: la URL la construye a mano el responsable.
export const dynamic = "force-dynamic";

export default async function FacturePubliquePage({
  params,
}: {
  params: Promise<{ numero: string }>;
}) {
  const { numero } = await params;

  const factura = await prisma.factura.findFirst({
    where: { nombreFactura: numero },
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
    return (
      <Shell titre={numero}>
        <div className="text-center py-10">
          <Clock className="w-10 h-10 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-800">
            Facture pas encore disponible
          </h2>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            La facture <strong>{numero}</strong> n&apos;est pas encore enregistrée dans
            le système. Elle le sera sous peu — veuillez réessayer dans quelques
            minutes en rechargeant cette page.
          </p>
        </div>
      </Shell>
    );
  }

  const respuesta = factura.historialAprobacion[0] ?? null;

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

      {/* Datos de la factura */}
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 mb-6">
        <Champ label="Date de la facture" valeur={formatDate(factura.dateFacture)} />
        <Champ label="Date de la saisie" valeur={formatDate(factura.dateSaisie)} />
        <Champ label="Fournisseur" valeur={factura.fournisseur?.nombre ?? "—"} />
        <Champ label="École" valeur={factura.ecole?.nombre ?? "—"} />
        <Champ
          label="Agent administratif"
          valeur={factura.responsableNombre ?? "—"}
        />
        <Champ label="Indice comptable" valeur={factura.indiceComptable ?? "—"} />
        <Champ label="Paiement rapide" valeur={factura.paimentRapide ? "Oui" : "Non"} />
        <Champ
          label="Fournisseur homologué"
          valeur={factura.fourHomologue ? "Oui" : "Non"}
        />
      </div>

      {/* Cadena de aprobación interna, informativa */}
      <ChaineApprobation factura={factura} />

      {/* Respuesta */}
      <div className="mt-8 pt-6 border-t">
        {respuesta ? (
          <ReponseDeja respuesta={respuesta} />
        ) : (
          <ReponseForm numero={factura.nombreFactura} />
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

const ROLES_AFFICHES = [
  { label: "Chargé de projet", nombre: "cpNombre", etat: "etatCP" },
  { label: "Régisseur", nombre: "regisseurNombre", etat: "etatRegisseur" },
  { label: "Coordonnateur", nombre: "coordoNombre", etat: "etatCoordo" },
  { label: "Direction adjointe de service", nombre: "dirAdjointeNombre", etat: "etatDirAdj" },
  { label: "Direction de service", nombre: "directionGeneraleNombre", etat: "etatDirGen" },
] as const;

function ChaineApprobation({
  factura,
}: {
  factura: Record<string, unknown> & { nombreFactura: string };
}) {
  return (
    <div>
      <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-3">
        Chaîne d&apos;approbation
      </h2>
      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
        {ROLES_AFFICHES.map((r) => {
          const nombre = factura[r.nombre] as string | null;
          const etat = factura[r.etat] as string;
          return (
            <div
              key={r.label}
              className="flex items-center justify-between px-4 py-2.5 text-sm"
            >
              <span className="text-gray-600">{r.label}</span>
              <span className="flex items-center gap-3">
                <span className="text-gray-800">{nombre ?? "—"}</span>
                {etat === "APPROUVE" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Approuvé
                  </span>
                )}
                {etat === "REFUSE" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    Refusé
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
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
          Facture {approuve ? "approuvée" : "refusée"}
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
