"use client";

import { useState } from "react";
import { X, Send, Loader2, Plus } from "lucide-react";
import type { FacturaResumen } from "@/types";

interface EmailComposerProps {
  factura: FacturaResumen;
  onClose: () => void;
}

export function EmailComposer({ factura, onClose }: EmailComposerProps) {
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [toInput, setToInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [subject, setSubject] = useState(`Facture ${factura.nombreFactura} — Projet ${factura.noProjet}`);
  const [body, setBody] = useState(
    `Bonjour,\n\nVeuillez trouver ci-joint les informations de la facture:\n\n• No. Facture: ${factura.nombreFactura}\n• Projet: ${factura.noProjet}\n• Fournisseur: ${factura.fournisseur.nombre}\n• Montant: ${Number(factura.montant).toLocaleString("fr-CA", { style: "currency", currency: "CAD" })}\n\nCordialement,`
  );
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addEmail(list: string[], setList: (v: string[]) => void, input: string, setInput: (v: string) => void) {
    const email = input.trim().toLowerCase();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !list.includes(email)) {
      setList([...list, email]);
    }
    setInput("");
  }

  async function handleSend() {
    if (to.length === 0) { setError("Ajoutez au moins un destinataire"); return; }
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/correo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, cc, subject, bodyHtml: body.replace(/\n/g, "<br>") }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur lors de l'envoi");
      }
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur d'envoi");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Envoyer un courriel</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* À */}
          <EmailField
            label="À"
            emails={to}
            onRemove={(e) => setTo(to.filter((x) => x !== e))}
            input={toInput}
            onInputChange={setToInput}
            onAdd={() => addEmail(to, setTo, toInput, setToInput)}
          />

          {/* CC */}
          <EmailField
            label="CC"
            emails={cc}
            onRemove={(e) => setCc(cc.filter((x) => x !== e))}
            input={ccInput}
            onInputChange={setCcInput}
            onAdd={() => addEmail(cc, setCc, ccInput, setCcInput)}
          />

          {/* Objet */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Objet</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-csdm-blue"
            />
          </div>

          {/* Corps */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
              className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-csdm-blue resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          {sent && <p className="text-sm text-green-600 font-medium">Courriel envoyé avec succès!</p>}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-3 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-csdm-blue hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-60"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}

function EmailField({
  label, emails, onRemove, input, onInputChange, onAdd,
}: {
  label: string;
  emails: string[];
  onRemove: (e: string) => void;
  input: string;
  onInputChange: (v: string) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</label>
      <div className="mt-1 flex flex-wrap gap-1.5 border border-gray-300 rounded-lg px-2 py-1.5 min-h-[40px]">
        {emails.map((e) => (
          <span key={e} className="flex items-center gap-1 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
            {e}
            <button onClick={() => onRemove(e)} className="hover:text-blue-600">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="email"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); onAdd(); } }}
          placeholder="email@csdm.qc.ca"
          className="flex-1 min-w-[180px] text-sm outline-none py-0.5"
        />
        <button onClick={onAdd} className="text-csdm-blue hover:text-blue-700 p-0.5">
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
