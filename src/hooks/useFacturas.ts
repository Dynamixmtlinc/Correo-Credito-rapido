import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { FiltrosFactura, FacturaResumen, PaginatedResponse, AprobacionPayload } from "@/types";

async function fetchFacturas(filtros: FiltrosFactura): Promise<PaginatedResponse<FacturaResumen>> {
  const params = new URLSearchParams();
  if (filtros.busqueda) params.set("busqueda", filtros.busqueda);
  if (filtros.etat) params.set("etat", filtros.etat);
  if (filtros.aprobadorEmail) params.set("aprobador", filtros.aprobadorEmail);
  if (filtros.reponse) params.set("reponse", filtros.reponse);
  if (filtros.page) params.set("page", String(filtros.page));
  if (filtros.pageSize) params.set("pageSize", String(filtros.pageSize));

  const res = await fetch(`/api/facturas?${params.toString()}`);
  if (!res.ok) throw new Error("Erreur lors du chargement des factures");
  return res.json();
}

async function fetchFactura(id: string) {
  const res = await fetch(`/api/facturas/${id}`);
  if (!res.ok) throw new Error("Facture non trouvée");
  return res.json();
}

export function useFacturas(filtros: FiltrosFactura) {
  return useQuery({
    queryKey: ["facturas", filtros],
    queryFn: () => fetchFacturas(filtros),
  });
}

export function useFactura(id: string | null) {
  return useQuery({
    queryKey: ["factura", id],
    queryFn: () => fetchFactura(id!),
    enabled: !!id,
  });
}

export function useAprobarFactura() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: AprobacionPayload }) => {
      const res = await fetch(`/api/facturas/${id}/aprobar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erreur lors de l'approbation");
      }
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["facturas"] });
      queryClient.invalidateQueries({ queryKey: ["factura", id] });
    },
  });
}

export function useDocumentos(facturaId: string | null) {
  return useQuery({
    queryKey: ["documentos", facturaId],
    queryFn: async () => {
      const res = await fetch(`/api/facturas/${facturaId}/documentos`);
      if (!res.ok) throw new Error("Erreur chargement documents");
      return res.json();
    },
    enabled: !!facturaId,
  });
}
