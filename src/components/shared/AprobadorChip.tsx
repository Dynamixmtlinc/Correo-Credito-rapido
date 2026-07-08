import { cn, getInitials, COLOR_APROBADOR } from "@/lib/utils";
import type { ResumenAprobador } from "@/types";
import { EstatusAprobador } from "@/types";

interface AprobadorChipProps {
  aprobador: ResumenAprobador;
  compact?: boolean;
}

const COLOR_AVATAR: Record<EstatusAprobador, string> = {
  EN_COURS: "bg-yellow-400 text-yellow-900",
  APPROUVE: "bg-green-500 text-white",
  REFUSE: "bg-red-500 text-white",
  VACIO: "bg-gray-300 text-gray-600",
};

export function AprobadorChip({ aprobador, compact = false }: AprobadorChipProps) {
  const initials = getInitials(aprobador.nombre ?? aprobador.email ?? aprobador.rolLabel);
  const colorAvatar = COLOR_AVATAR[aprobador.estado];

  if (compact) {
    return (
      <div
        title={`${aprobador.rolLabel}: ${aprobador.nombre ?? aprobador.email ?? "—"}`}
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white",
          colorAvatar
        )}
      >
        {initials.slice(0, 1)}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-white flex-shrink-0",
          colorAvatar
        )}
      >
        {initials}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-gray-700 truncate">
          {aprobador.nombre ?? aprobador.email ?? "—"}
        </p>
        <p className="text-xs text-gray-400">{aprobador.rolLabel}</p>
      </div>
    </div>
  );
}

interface AprobadoresListProps {
  aprobadores: ResumenAprobador[];
  compact?: boolean;
}

export function AprobadoresList({ aprobadores, compact = false }: AprobadoresListProps) {
  if (aprobadores.length === 0) return <span className="text-xs text-gray-400">—</span>;

  if (compact) {
    return (
      <div className="flex -space-x-1">
        {aprobadores.map((a) => (
          <AprobadorChip key={a.rol} aprobador={a} compact />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {aprobadores.map((a) => (
        <AprobadorChip key={a.rol} aprobador={a} />
      ))}
    </div>
  );
}
