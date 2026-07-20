"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { X, Pencil, Mail, FolderOpen, Download, Plus, CheckCircle2, XCircle, Loader2, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useFactura, useAprobarFactura, useDocumentos } from "@/hooks/useFacturas";
import { EstadoFacturaBadge, EstadoAprobadorBadge } from "@/components/shared/EstadoBadge";
import { AprobadoresList } from "@/components/shared/AprobadorChip";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { formatMonto, formatDate, getAprobadores, getRolEnFactura, getEstadoParaRol, formatFileSize } from "@/lib/utils";
import { EstatusAprobador } from "@/types";
import type { FacturaResumen } from "@/types";

interface FacturaDetalleProps {
  facturaResumen: FacturaResumen;
  onClose: () => void;
  onEdit: () => void;
  onEmail: () => void;
}

export function FacturaDetalle({ facturaResumen, onClose, onEdit, onEmail }: FacturaDetalleProps) {
  const { data: session } = useSession();
  const { data: factura, isLoading } = useFactura(facturaResumen.id);
  const { data: documentos = [] } = useDocumentos(facturaResumen.id);
  const aprobarMutation = useAprobarFactura();

  const [confirmacion, setConfirmacion] = useState<{ decision: "APPROUVE" | "REFUSE"; comentario?: string } | null>(null);
  const [comentarioInput, setComentarioInput] = useState("");
  const [showDocs, setShowDocs] = useState(false);
  const [showChecks, setShowChecks] = useState(false);

  const userEmail = session?.user?.email ?? "";
  const rol = getRolEnFactura(userEmail, facturaResumen);
  const estadoRol = getEstadoParaRol(facturaResumen, rol);
  const puedeAprobar = ["cp", "regisseur", "coordo", "dirAdj", "dirGen"].includes(rol) && estadoRol === EstatusAprobador.EN_COURS;
  const esResponsable = rol === "responsable";
  const aprobadores = getAprobadores(facturaResumen);

  function handleDecision(decision: "APPROUVE" | "REFUSE") {
    setConfirmacion({ decision, comentario: comentarioInput });
  }

  async function confirmarDecision() {
    if (!confirmacion) return;
    await aprobarMutation.mutateAsync({
      id: facturaResumen.id,
      payload: { decision: confirmacion.decision, comentario: confirmacion.comentario },
    });
    setConfirmacion(null);
    setComentarioInput("");
  }

  const data = factura ?? facturaResumen;

  return (
    <>
      <div className="fixed inset-0 z-40 flex">
        {/* Overlay */}
        <div className="flex-1 bg-black/30" onClick={onClose} />

        {/* Panel */}
        <div className="w-full max-w-xl bg-white shadow-2xl overflow-y-auto flex flex-col">
          {/* Header */}
          <div className="bg-csdm-dark text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
            <div>
              <p className="font-semibold text-base">{facturaResumen.nombreFactura}</p>
              <p className="text-xs text-blue-200">Projet: {facturaResumen.noProjet}</p>
            </div>
            <div className="flex items-center gap-2">
              <EstadoFacturaBadge estado={facturaResumen.etatFacture} />
              <button onClick={onClose} className="p-1 rounded hover:bg-white/10 transition-colors ml-2">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 p-5 space-y-5">
            {/* Datos principales */}
            <div className="grid grid-cols-2 gap-3">
              <InfoField label="École" value={facturaResumen.ecole?.nombre ?? "—"} />
              <InfoField label="Fournisseur" value={facturaResumen.fournisseur?.nombre ?? "—"} />
              <InfoField label="Montant" value={formatMonto(Number(facturaResumen.montant))} highlight />
              <InfoField label="Date de facture" value={formatDate(facturaResumen.dateFacture)} />
              <InfoField label="Date de saisie" value={formatDate(facturaResumen.dateSaisie)} />
              {facturaResumen.dateLimite && (
                <InfoField label="Date limite" value={formatDate(facturaResumen.dateLimite)} highlight />
              )}
              {(data as typeof factura)?.indiceComptable && (
                <InfoField label="Indice comptable" value={(data as typeof factura)?.indiceComptable!} />
              )}
              {facturaResumen.srmProjet && (
                <InfoField label="SRM Projet" value={facturaResumen.srmProjet} />
              )}
            </div>

            {/* Aprobadores */}
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Approbateurs</h3>
              {aprobadores.length > 0 ? (
                <AprobadoresList aprobadores={aprobadores} />
              ) : (
                <p className="text-sm text-gray-400">Aucun approbateur assigné</p>
              )}
            </section>

            {/* Comentarios */}
            {facturaResumen.commentairesResponsable && (
              <section>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Commentaires</h3>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-md px-3 py-2">
                  {facturaResumen.commentairesResponsable}
                </p>
              </section>
            )}

            {/* Checks (colapsable) */}
            {isLoading ? null : (
              <section>
                <button
                  onClick={() => setShowChecks(!showChecks)}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1"
                >
                  Vérifications
                  {showChecks ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showChecks && factura && (
                  <div className="grid grid-cols-2 gap-1.5 text-sm">
                    <CheckRow label="Répartition S9" value={factura.repartitionRequise} />
                    <CheckRow label="Raison sociale" value={factura.raisonSocialConforme} />
                    <CheckRow label="10% à vérifier" value={factura.dixPourcentVerifier} />
                    <CheckRow label="Fournisseur homologué" value={factura.fourHomologue} />
                    <CheckRow label="Paiement rapide" value={factura.paimentRapide} />
                    <CheckRow label="Affectation crédit" value={factura.affectationCreditCheck} />
                  </div>
                )}
              </section>
            )}

            {/* Documentos (colapsable) */}
            <section>
              <button
                onClick={() => setShowDocs(!showDocs)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1"
              >
                Documents ({documentos.length})
                {showDocs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showDocs && (
                <div className="space-y-1.5">
                  {documentos.length === 0 && (
                    <p className="text-sm text-gray-400">Aucun document</p>
                  )}
                  {documentos.map((doc: { id: string; nombre: string; tamano: number; sasUrl?: string; blobUrl?: string }) => (
                    <div key={doc.id} className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2">
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-sm flex-1 truncate">{doc.nombre}</span>
                      <span className="text-xs text-gray-400">{formatFileSize(doc.tamano)}</span>
                      <a
                        href={`/api/facturas/${facturaResumen.id}/documentos/${doc.id}/descargar`}
                        download={doc.nombre}
                        className="p-1 rounded hover:bg-gray-200 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-gray-500" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Zona de aprobación */}
            {puedeAprobar && (
              <section className="border border-dashed border-blue-300 rounded-xl p-4 bg-blue-50/50">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Votre décision</h3>
                <textarea
                  value={comentarioInput}
                  onChange={(e) => setComentarioInput(e.target.value)}
                  placeholder="Commentaire optionnel..."
                  rows={2}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-csdm-blue"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => handleDecision("APPROUVE")}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approuver
                  </button>
                  <button
                    onClick={() => handleDecision("REFUSE")}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
                  >
                    <XCircle className="w-4 h-4" /> Refuser
                  </button>
                </div>
              </section>
            )}
          </div>

          {/* Footer de acciones */}
          <div className="border-t px-5 py-3 flex items-center gap-2 flex-shrink-0">
            {esResponsable && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Modifier
              </button>
            )}
            <button
              onClick={onEmail}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Courriel
            </button>
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmacion}
        title={confirmacion?.decision === "APPROUVE" ? "Confirmer l'approbation" : "Confirmer le refus"}
        description={
          confirmacion?.decision === "APPROUVE"
            ? "Êtes-vous sûr de vouloir approuver cette facture?"
            : "Êtes-vous sûr de vouloir refuser cette facture?"
        }
        confirmLabel={confirmacion?.decision === "APPROUVE" ? "Approuver" : "Refuser"}
        variant={confirmacion?.decision === "REFUSE" ? "danger" : "default"}
        onConfirm={confirmarDecision}
        onCancel={() => setConfirmacion(null)}
        loading={aprobarMutation.isPending}
      />
    </>
  );
}

function InfoField({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className={`text-sm mt-0.5 ${highlight ? "font-semibold text-csdm-dark" : "text-gray-700"}`}>{value}</p>
    </div>
  );
}

function CheckRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${value ? "bg-green-100" : "bg-gray-100"}`}>
        {value ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-gray-300 block" />
        )}
      </div>
      <span className={`text-xs ${value ? "text-gray-800" : "text-gray-400"}`}>{label}</span>
    </div>
  );
}
