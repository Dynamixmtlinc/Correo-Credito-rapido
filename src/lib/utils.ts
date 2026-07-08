import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, differenceInDays, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import type {
  FacturaResumen,
  ResumenAprobador,
  RolEnFactura,
} from "@/types";
import { EstatusAprobador, EstatusFactura } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formatear monto en CAD
export function formatMonto(monto: number | string): string {
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD",
  }).format(Number(monto));
}

// Formatear fecha en formato francés
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, "d MMM yyyy", { locale: fr });
}

// Edad en días desde la fecha de captura
export function calcularEdadDias(dateSaisie: Date | string): number {
  const d = typeof dateSaisie === "string" ? parseISO(dateSaisie) : dateSaisie;
  return differenceInDays(new Date(), d);
}

// Etiquetas de estado de factura
export const ETIQUETA_ESTATUS: Record<EstatusFactura, string> = {
  OUVERT: "Ouvert",
  EN_COURS: "En cours",
  APPROUVE: "Approuvé",
  REFUSE: "Refusé",
  PAYE: "Payé",
};

// Colores de badge por estado de factura
export const COLOR_ESTATUS: Record<EstatusFactura, string> = {
  OUVERT: "bg-blue-100 text-blue-800",
  EN_COURS: "bg-yellow-100 text-yellow-800",
  APPROUVE: "bg-green-100 text-green-800",
  REFUSE: "bg-red-100 text-red-800",
  PAYE: "bg-purple-100 text-purple-800",
};

// Colores de badge por estado de aprobador
export const COLOR_APROBADOR: Record<EstatusAprobador, string> = {
  EN_COURS: "bg-yellow-100 text-yellow-700 border border-yellow-300",
  APPROUVE: "bg-green-100 text-green-700 border border-green-300",
  REFUSE: "bg-red-100 text-red-700 border border-red-300",
  VACIO: "bg-gray-100 text-gray-400 border border-gray-200",
};

export const ETIQUETA_APROBADOR: Record<EstatusAprobador, string> = {
  EN_COURS: "En cours",
  APPROUVE: "Approuvé",
  REFUSE: "Refusé",
  VACIO: "—",
};

// Obtener lista de aprobadores de una factura
export function getAprobadores(factura: FacturaResumen): ResumenAprobador[] {
  const roles: ResumenAprobador[] = [];

  if (factura.cpEmail) {
    roles.push({
      rol: "cp",
      rolLabel: "CP",
      email: factura.cpEmail,
      nombre: factura.cpNombre,
      estado: factura.etatCP,
    });
  }
  if (factura.regisseurEmail) {
    roles.push({
      rol: "regisseur",
      rolLabel: "Régisseur",
      email: factura.regisseurEmail,
      nombre: factura.regisseurNombre,
      estado: factura.etatRegisseur,
    });
  }
  if (factura.coordoEmail) {
    roles.push({
      rol: "coordo",
      rolLabel: "Coordo",
      email: factura.coordoEmail,
      nombre: factura.coordoNombre,
      estado: factura.etatCoordo,
    });
  }
  if (factura.dirAdjointeEmail) {
    roles.push({
      rol: "dirAdj",
      rolLabel: "Dir. Adj.",
      email: factura.dirAdjointeEmail,
      nombre: factura.dirAdjointeNombre,
      estado: factura.etatDirAdj,
    });
  }
  if (factura.directionGeneraleEmail) {
    roles.push({
      rol: "dirGen",
      rolLabel: "Dir. Gén.",
      email: factura.directionGeneraleEmail,
      nombre: factura.directionGeneraleNombre,
      estado: factura.etatDirGen,
    });
  }

  return roles;
}

// Determinar el rol del usuario actual para una factura
export function getRolEnFactura(
  userEmail: string,
  factura: FacturaResumen
): RolEnFactura {
  const email = userEmail.toLowerCase();
  if (factura.responsableEmail?.toLowerCase() === email) return "responsable";
  if (factura.cpEmail?.toLowerCase() === email) return "cp";
  if (factura.regisseurEmail?.toLowerCase() === email) return "regisseur";
  if (factura.coordoEmail?.toLowerCase() === email) return "coordo";
  if (factura.dirAdjointeEmail?.toLowerCase() === email) return "dirAdj";
  if (factura.directionGeneraleEmail?.toLowerCase() === email) return "dirGen";
  return "viewer";
}

// Estado del aprobador para el rol dado
export function getEstadoParaRol(
  factura: FacturaResumen,
  rol: RolEnFactura
): EstatusAprobador {
  switch (rol) {
    case "cp": return factura.etatCP;
    case "regisseur": return factura.etatRegisseur;
    case "coordo": return factura.etatCoordo;
    case "dirAdj": return factura.etatDirAdj;
    case "dirGen": return factura.etatDirGen;
    default: return EstatusAprobador.VACIO;
  }
}

// Formatear tamaño de archivo
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Obtener extensión de un nombre de archivo
export function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

// Iniciales de un nombre para avatar
export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

// Calcular estado general de factura basado en aprobadores
export function calcularEstatusGeneral(factura: {
  etatCP: EstatusAprobador;
  etatRegisseur: EstatusAprobador;
  etatCoordo: EstatusAprobador;
  etatDirAdj: EstatusAprobador;
  etatDirGen: EstatusAprobador;
  cpEmail?: string | null;
  regisseurEmail?: string | null;
  coordoEmail?: string | null;
  dirAdjointeEmail?: string | null;
  directionGeneraleEmail?: string | null;
}): EstatusFactura {
  const estadosActivos: EstatusAprobador[] = [];

  if (factura.cpEmail) estadosActivos.push(factura.etatCP);
  if (factura.regisseurEmail) estadosActivos.push(factura.etatRegisseur);
  if (factura.coordoEmail) estadosActivos.push(factura.etatCoordo);
  if (factura.dirAdjointeEmail) estadosActivos.push(factura.etatDirAdj);
  if (factura.directionGeneraleEmail) estadosActivos.push(factura.etatDirGen);

  if (estadosActivos.some((e) => e === EstatusAprobador.REFUSE)) {
    return EstatusFactura.REFUSE;
  }
  if (estadosActivos.length > 0 && estadosActivos.every((e) => e === EstatusAprobador.APPROUVE)) {
    return EstatusFactura.APPROUVE;
  }
  if (estadosActivos.some((e) => e === EstatusAprobador.EN_COURS)) {
    return EstatusFactura.EN_COURS;
  }
  return EstatusFactura.OUVERT;
}
