"use client";

import { Search, RefreshCw, X } from "lucide-react";
import { EstatusFactura } from "@/types";
import { ETIQUETA_ESTATUS } from "@/lib/utils";
import type { FiltrosFactura } from "@/types";

interface FiltrosBarraProps {
  filtros: FiltrosFactura;
  onChange: (filtros: Partial<FiltrosFactura>) => void;
  total: number;
  onRefresh: () => void;
}

const ESTADOS_OPCIONES = [
  { value: "", label: "Tous les états" },
  ...Object.entries(ETIQUETA_ESTATUS).map(([value, label]) => ({ value, label })),
];

export function FiltrosBarra({ filtros, onChange, total, onRefresh }: FiltrosBarraProps) {
  return (
    <div className="bg-white border-b px-4 py-3 flex flex-wrap items-center gap-3">
      {/* Búsqueda */}
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={filtros.busqueda ?? ""}
          onChange={(e) => onChange({ busqueda: e.target.value || undefined, page: 1 })}
          placeholder="Rechercher..."
          className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-csdm-blue focus:border-transparent"
        />
        {filtros.busqueda && (
          <button
            onClick={() => onChange({ busqueda: undefined, page: 1 })}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-gray-100"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Filtro estado */}
      <select
        value={filtros.etat ?? ""}
        onChange={(e) => onChange({ etat: (e.target.value as EstatusFactura) || undefined, page: 1 })}
        className="text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-csdm-blue focus:border-transparent bg-white"
      >
        {ESTADOS_OPCIONES.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Botón actualizar */}
      <button
        onClick={onRefresh}
        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
        title="Actualiser"
      >
        <RefreshCw className="w-4 h-4 text-gray-500" />
      </button>

      {/* Contador */}
      <span className="text-sm text-gray-500 ml-auto">
        {total} facture{total !== 1 ? "s" : ""}
      </span>
    </div>
  );
}
