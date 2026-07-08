import { cn, ETIQUETA_ESTATUS, COLOR_ESTATUS, COLOR_APROBADOR, ETIQUETA_APROBADOR } from "@/lib/utils";
import type { EstatusFactura, EstatusAprobador } from "@/types";

interface EstadoFacturaBadgeProps {
  estado: EstatusFactura;
  className?: string;
}

export function EstadoFacturaBadge({ estado, className }: EstadoFacturaBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        COLOR_ESTATUS[estado],
        className
      )}
    >
      {ETIQUETA_ESTATUS[estado]}
    </span>
  );
}

interface EstadoAprobadorBadgeProps {
  estado: EstatusAprobador;
  className?: string;
}

export function EstadoAprobadorBadge({ estado, className }: EstadoAprobadorBadgeProps) {
  if (estado === "VACIO") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium",
        COLOR_APROBADOR[estado],
        className
      )}
    >
      {ETIQUETA_APROBADOR[estado]}
    </span>
  );
}
