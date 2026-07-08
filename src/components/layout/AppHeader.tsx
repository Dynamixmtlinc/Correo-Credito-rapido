"use client";

import { useSession, signOut } from "next-auth/react";
import { RefreshCw, LogOut, User } from "lucide-react";
import { getInitials } from "@/lib/utils";

interface AppHeaderProps {
  onRefresh?: () => void;
}

export function AppHeader({ onRefresh }: AppHeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="bg-csdm-dark text-white shadow-lg">
      <div className="max-w-screen-2xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo + título */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-csdm-blue flex items-center justify-center flex-shrink-0">
            <span className="font-bold text-sm text-white">C</span>
          </div>
          <div>
            <p className="font-semibold text-sm leading-tight">Approbations de Factures</p>
            <p className="text-xs text-blue-200 leading-tight">CSDM</p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-3">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded hover:bg-white/10 transition-colors"
              title="Actualiser"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {session?.user && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-csdm-blue flex items-center justify-center text-xs font-medium">
                {getInitials(session.user.name ?? session.user.email ?? "U")}
              </div>
              <span className="text-sm hidden sm:block max-w-[160px] truncate">
                {session.user.name ?? session.user.email}
              </span>
            </div>
          )}

          <button
            onClick={() => signOut({ callbackUrl: "/auth/signin" })}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title="Se déconnecter"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
