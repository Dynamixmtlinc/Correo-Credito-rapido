"use client";

import { formatMonto, formatDate, calcularEdadDias, getAprobadores, cn } from "@/lib/utils";
import { EstadoFacturaBadge } from "@/components/shared/EstadoBadge";
import { AprobadoresList } from "@/components/shared/AprobadorChip";
import type { FacturaResumen } from "@/types";
import { MessageSquare, Zap, ChevronRight, Clock, Check, X } from "lucide-react";

interface FacturaGaleriaProps {
  facturas: FacturaResumen[];
  onSelect: (factura: FacturaResumen) => void;
  selectedId?: string | null;
}

/** Estado de la respuesta del proveedor en la página pública. */
function ReponseFournisseurBadge({
  respuesta,
}: {
  respuesta: FacturaResumen["respuestaFournisseur"];
}) {
  if (!respuesta) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
        <Clock className="w-3 h-3" />
        En attente
      </span>
    );
  }

  const approuve = respuesta.decision === "APPROUVE";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
        approuve ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      )}
      title={respuesta.comentario ?? undefined}
    >
      {approuve ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
      {approuve ? "Approuvé" : "Refusé"}
    </span>
  );
}

export function FacturaGaleria({ facturas, onSelect, selectedId }: FacturaGaleriaProps) {
  if (facturas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-lg font-medium">Aucune facture trouvée</p>
        <p className="text-sm mt-1">Modifiez les filtres ou ajoutez une nouvelle facture</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b text-left">
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">No. Facture</th>
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">École</th>
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Projet</th>
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Fournisseur</th>
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap text-right">Montant</th>
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap text-center">Âge</th>
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Approbateurs</th>
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Réponse</th>
            <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">État</th>
            <th className="px-4 py-3 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {facturas.map((f) => {
            const aprobadores = getAprobadores(f);
            const edad = calcularEdadDias(f.dateSaisie);
            const isSelected = f.id === selectedId;

            return (
              <tr
                key={f.id}
                onClick={() => onSelect(f)}
                className={cn(
                  "cursor-pointer transition-colors hover:bg-blue-50/60",
                  isSelected && "bg-blue-50 border-l-2 border-csdm-blue"
                )}
              >
                <td className="px-4 py-3 font-medium text-csdm-dark whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    {f.paimentRapide && (
                      <span title="Paiement rapide"><Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" /></span>
                    )}
                    {f.nombreFactura}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700 max-w-[160px]">
                  <span className="truncate block">{f.ecole?.nombre ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{f.noProjet}</td>
                <td className="px-4 py-3 text-gray-700 max-w-[160px]">
                  <span className="truncate block">{f.fournisseur?.nombre ?? "—"}</span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-800 whitespace-nowrap">
                  {formatMonto(Number(f.montant))}
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={cn(
                      "text-xs font-medium px-2 py-0.5 rounded-full",
                      edad > 30 ? "bg-red-100 text-red-700" :
                      edad > 14 ? "bg-amber-100 text-amber-700" :
                      "bg-green-100 text-green-700"
                    )}
                  >
                    {edad}j
                  </span>
                </td>
                <td className="px-4 py-3">
                  <AprobadoresList aprobadores={aprobadores} compact />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <ReponseFournisseurBadge respuesta={f.respuestaFournisseur} />
                </td>
                <td className="px-4 py-3">
                  <EstadoFacturaBadge estado={f.etatFacture} />
                </td>
                <td className="px-4 py-3">
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface PaginacionProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Paginacion({ page, totalPages, onChange }: PaginacionProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 py-4 border-t">
      <button
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-40 hover:bg-gray-50 transition-colors"
      >
        Précédent
      </button>
      <span className="text-sm text-gray-600">
        Page {page} / {totalPages}
      </span>
      <button
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1.5 text-sm border rounded-md disabled:opacity-40 hover:bg-gray-50 transition-colors"
      >
        Suivant
      </button>
    </div>
  );
}
