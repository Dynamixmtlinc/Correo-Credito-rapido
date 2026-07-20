"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, AlertCircle } from "lucide-react";

type Decision = "APPROUVE" | "REFUSE";

export function ReponseForm({ numero }: { numero: string }) {
  const router = useRouter();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comentario, setComentario] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Refuser sin motivo no le sirve a nadie aguas abajo; el backend lo exige igual.
  const commentaireRequis = decision === "REFUSE";
  const peutEnvoyer =
    decision !== null && (!commentaireRequis || comentario.trim().length > 0);

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
          body: JSON.stringify({ decision, comentario: comentario.trim() || undefined }),
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
          Approuver
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
          Refuser
        </button>
      </div>

      {/* Comentario */}
      <div className="mt-4">
        <label
          htmlFor="commentaire"
          className="block text-sm font-medium text-gray-700"
        >
          Commentaire{" "}
          {commentaireRequis ? (
            <span className="text-red-600">(obligatoire pour un refus)</span>
          ) : (
            <span className="text-gray-400 font-normal">(facultatif)</span>
          )}
        </label>
        <textarea
          id="commentaire"
          rows={4}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          disabled={envoi}
          maxLength={2000}
          placeholder={
            commentaireRequis
              ? "Indiquez le motif du refus…"
              : "Ajoutez une précision si nécessaire…"
          }
          className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-csdm-blue focus:border-transparent disabled:bg-gray-50"
        />
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
