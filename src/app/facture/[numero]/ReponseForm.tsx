"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, AlertCircle, CalendarClock } from "lucide-react";

type Decision = "APPROUVE" | "REFUSE";

export function ReponseForm({
  numero,
  dateLimite,
  joursRestants,
}: {
  numero: string;
  /** Fecha límite ya formateada en el servidor. */
  dateLimite: string;
  joursRestants: number;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // El proveedor solo elige entre «J'accepte» y «Je conteste»: no escribe nada.
  // El enum sigue siendo APPROUVE/REFUSE: cambió la UI, no el modelo de datos.
  const peutEnvoyer = decision !== null;

  async function envoyer() {
    if (!decision || !peutEnvoyer) return;
    setEnvoi(true);
    setErreur(null);

    try {
      const res = await fetch(
        `/api/facture/${encodeURIComponent(numero)}/repondre`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Erreur lors de l'envoi de la réponse");
      }

      // Recarga en servidor: la página pasa a mostrar la respuesta registrada.
      router.refresh();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'envoi");
      setEnvoi(false);
    }
  }

  return (
    <div>
      <h2 className="font-semibold text-gray-900">Votre réponse</h2>
      <p className="text-sm text-gray-500 mt-1">
        Cette facture ne peut être répondue qu&apos;une seule fois.
      </p>

      {/* El plazo se avisa antes de que el proveedor elija, no después de enviar. */}
      <div
        className={`mt-4 flex items-start gap-2 rounded-lg border p-3 ${
          joursRestants <= 5
            ? "border-amber-200 bg-amber-50"
            : "border-gray-200 bg-gray-50"
        }`}
      >
        <CalendarClock
          className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
            joursRestants <= 5 ? "text-amber-600" : "text-gray-400"
          }`}
        />
        <p
          className={`text-sm ${
            joursRestants <= 5 ? "text-amber-800" : "text-gray-600"
          }`}
        >
          {/* `joursRestants` se redondea hacia arriba: mientras quede plazo es ≥ 1,
              así que 1 significa "hoy es el último día". */}
          {joursRestants <= 1 ? (
            <>
              <strong>Dernier jour pour répondre :</strong> {dateLimite}. Passé ce
              délai, ce lien n&apos;acceptera plus de réponse.
            </>
          ) : (
            <>
              Vous avez jusqu&apos;au <strong>{dateLimite}</strong> pour répondre — il
              reste {joursRestants} jours. Passé ce délai, ce lien n&apos;acceptera
              plus de réponse.
            </>
          )}
        </p>
      </div>

      {/* Decisión */}
      <div className="grid gap-3 sm:grid-cols-2 mt-4">
        <button
          type="button"
          onClick={() => setDecision("APPROUVE")}
          disabled={envoi}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 font-medium transition-colors disabled:opacity-50 ${
            decision === "APPROUVE"
              ? "border-green-600 bg-green-50 text-green-700"
              : "border-gray-200 text-gray-600 hover:border-green-300 hover:bg-green-50/50"
          }`}
        >
          <Check className="w-4 h-4" />
          J&apos;accepte
        </button>

        <button
          type="button"
          onClick={() => setDecision("REFUSE")}
          disabled={envoi}
          className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 font-medium transition-colors disabled:opacity-50 ${
            decision === "REFUSE"
              ? "border-red-600 bg-red-50 text-red-700"
              : "border-gray-200 text-gray-600 hover:border-red-300 hover:bg-red-50/50"
          }`}
        >
          <X className="w-4 h-4" />
          Je conteste
        </button>
      </div>

      {erreur && (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{erreur}</p>
        </div>
      )}

      <button
        type="button"
        onClick={envoyer}
        disabled={!peutEnvoyer || envoi}
        className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-csdm-blue text-white font-medium hover:bg-csdm-blue/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {envoi ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Envoi en cours…
          </>
        ) : (
          "Envoyer ma réponse"
        )}
      </button>
    </div>
  );
}
