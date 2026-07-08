"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { FiltrosBarra } from "@/components/facturas/FiltrosBarra";
import { FacturaGaleria, Paginacion } from "@/components/facturas/FacturaGaleria";
import { FacturaDetalle } from "@/components/facturas/FacturaDetalle";
import { EmailComposer } from "@/components/facturas/EmailComposer";
import { useFacturas } from "@/hooks/useFacturas";
import type { FiltrosFactura, FacturaResumen } from "@/types";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [filtros, setFiltros] = useState<FiltrosFactura>({ page: 1, pageSize: 50 });
  const [selected, setSelected] = useState<FacturaResumen | null>(null);
  const [showEmail, setShowEmail] = useState(false);

  const { data, isLoading, refetch } = useFacturas(filtros);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 border-4 border-csdm-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    redirect("/auth/signin");
  }

  function handleFiltroChange(partial: Partial<FiltrosFactura>) {
    setFiltros((prev) => ({ ...prev, ...partial }));
  }

  function handleRefresh() {
    refetch();
  }

  function handleSelectFactura(factura: FacturaResumen) {
    setSelected(factura);
    setShowEmail(false);
  }

  function handleEdit() {
    if (selected) router.push(`/facturas/${selected.id}/modifier`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppHeader onRefresh={handleRefresh} />

      <div className="flex flex-1 overflow-hidden">
        {/* Panel izquierdo: Lista */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Filtros */}
          <FiltrosBarra
            filtros={filtros}
            onChange={handleFiltroChange}
            total={data?.total ?? 0}
            onRefresh={handleRefresh}
          />

          {/* Botón nueva factura */}
          <div className="px-4 py-2 flex items-center justify-between bg-white border-b">
            <span className="text-sm text-gray-500 font-medium">
              {isLoading ? "Chargement..." : `${data?.total ?? 0} facture(s)`}
            </span>
            <button
              onClick={() => router.push("/facturas/nouvelle")}
              className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium bg-csdm-blue hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouvelle facture
            </button>
          </div>

          {/* Galería */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-csdm-blue border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <>
                <FacturaGaleria
                  facturas={data?.data ?? []}
                  onSelect={handleSelectFactura}
                  selectedId={selected?.id}
                />
                <Paginacion
                  page={filtros.page ?? 1}
                  totalPages={data?.totalPages ?? 1}
                  onChange={(page) => handleFiltroChange({ page })}
                />
              </>
            )}
          </div>
        </div>

        {/* Panel derecho: Detalle (no modal, slide-over) */}
        {selected && !showEmail && (
          <FacturaDetalle
            facturaResumen={selected}
            onClose={() => setSelected(null)}
            onEdit={handleEdit}
            onEmail={() => setShowEmail(true)}
          />
        )}
      </div>

      {/* Modal de email */}
      {showEmail && selected && (
        <EmailComposer factura={selected} onClose={() => setShowEmail(false)} />
      )}
    </div>
  );
}
