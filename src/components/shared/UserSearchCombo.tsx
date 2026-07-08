"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import type { UsuarioO365 } from "@/types";

interface UserSearchComboProps {
  value?: { email: string; nombre: string } | null;
  onChange: (user: { email: string; nombre: string } | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function UserSearchCombo({
  value,
  onChange,
  placeholder = "Rechercher un utilisateur...",
  className,
  disabled = false,
}: UserSearchComboProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UsuarioO365[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/usuarios/buscar?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
  }, [query]);

  if (value) {
    return (
      <div className={cn("flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-2", className)}>
        <div className="w-7 h-7 rounded-full bg-csdm-blue text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
          {getInitials(value.nombre)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{value.nombre}</p>
          <p className="text-xs text-gray-500 truncate">{value.email}</p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-0.5 rounded hover:bg-blue-200 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-blue-600" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-csdm-blue focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {results.map((u) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={() => {
                onChange({ email: u.mail ?? u.userPrincipalName, nombre: u.displayName });
                setQuery("");
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-csdm-blue text-white flex items-center justify-center text-xs font-medium flex-shrink-0">
                {getInitials(u.displayName)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{u.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{u.mail ?? u.userPrincipalName}</p>
                {u.jobTitle && <p className="text-xs text-gray-400">{u.jobTitle}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {open && !loading && query.length >= 2 && results.length === 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2">
          <p className="text-sm text-gray-500">Aucun utilisateur trouvé</p>
        </div>
      )}
    </div>
  );
}
