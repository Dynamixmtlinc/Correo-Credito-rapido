import type {
  Factura as PrismaFactura,
  Fournisseur,
  Ecole,
  Documento,
  AdjuntoTemporal,
  HistorialAprobacion,
  Bureau,
} from "@prisma/client";
import { EstatusFactura, EstatusAprobador, TipoDocumento } from "@prisma/client";

// Re-exportar enums de Prisma como valores (no solo tipos)
export { EstatusFactura, EstatusAprobador, TipoDocumento };

// Factura con relaciones incluidas
export type FacturaConRelaciones = PrismaFactura & {
  ecole: Ecole;
  fournisseur: Fournisseur;
  documentos: Documento[];
  historialAprobacion: HistorialAprobacion[];
  bureau?: Bureau | null;
};

// Factura resumida para la galería
export type FacturaResumen = Pick<
  PrismaFactura,
  | "id"
  | "nombreFactura"
  | "noProjet"
  | "srmProjet"
  | "montant"
  | "dateFacture"
  | "dateSaisie"
  | "etatFacture"
  | "responsableEmail"
  | "responsableNombre"
  | "cpEmail"
  | "cpNombre"
  | "etatCP"
  | "regisseurEmail"
  | "regisseurNombre"
  | "etatRegisseur"
  | "coordoEmail"
  | "coordoNombre"
  | "etatCoordo"
  | "dirAdjointeEmail"
  | "dirAdjointeNombre"
  | "etatDirAdj"
  | "directionGeneraleEmail"
  | "directionGeneraleNombre"
  | "etatDirGen"
  | "commentairesResponsable"
  | "paimentRapide"
  | "dateLimite"
  | "createdAt"
> & {
  // Nulos cuando la factura entró por correo y el PDF no traía el dato.
  ecole: Pick<Ecole, "id" | "nombre"> | null;
  fournisseur: Pick<Fournisseur, "id" | "nombre"> | null;
  // Respuesta del proveedor desde la página pública, si ya la dio.
  respuestaFournisseur?: {
    decision: EstatusAprobador;
    comentario: string | null;
    createdAt: Date | string;
  } | null;
};

// Payload para crear factura
export interface CrearFacturaPayload {
  nombreFactura: string;
  noProjet: string;
  srmProjet?: string;
  ecoleId: string;
  fournisseurId: string;
  montant: number;
  dateFacture: string;       // ISO date
  dateSaisie?: string;
  dateLimite?: string;
  indiceComptable?: string;
  affectationCredit?: string;

  // Aprobadores
  cpEmail?: string;
  cpNombre?: string;
  regisseurEmail?: string;
  regisseurNombre?: string;
  coordoEmail?: string;
  coordoNombre?: string;
  dirAdjointeEmail?: string;
  dirAdjointeNombre?: string;
  directionGeneraleEmail?: string;
  directionGeneraleNombre?: string;
  cooEmail?: string;
  cooNombre?: string;

  // Checkboxes
  repartitionRequise?: boolean;
  raisonSocialConforme?: boolean;
  dixPourcentVerifier?: boolean;
  fourHomologue?: boolean;
  paimentRapide?: boolean;
  affectationCreditCheck?: boolean;

  commentairesResponsable?: string;
  idSolicitudTemporal?: string;  // Para mover adjuntos temporales
}

// Payload para actualizar factura
export type ActualizarFacturaPayload = Partial<CrearFacturaPayload> & {
  etatFacture?: EstatusFactura;
  commentairesAdmin?: string;
};

// Payload para aprobar/rechazar
export interface AprobacionPayload {
  decision: "APPROUVE" | "REFUSE";
  comentario?: string;
}

// Filtros para listar facturas
export interface FiltrosFactura {
  busqueda?: string;
  etat?: EstatusFactura;
  aprobadorEmail?: string;
  /** Filtra por si el proveedor ya respondió desde la página pública. */
  reponse?: "attente" | "repondu";
  page?: number;
  pageSize?: number;
}

// Respuesta paginada
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// Usuario de Graph API / Office 365
export interface UsuarioO365 {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
  jobTitle?: string;
  photo?: string;
}

// Payload de correo
export interface EnviarCorreoPayload {
  to: string[];
  cc?: string[];
  subject: string;
  bodyHtml: string;
}

// Documento con URL de descarga
export interface DocumentoConUrl extends Omit<Documento, "contenido"> {
  downloadUrl: string;
}

// Resumen de aprobador para mostrar en UI
export interface ResumenAprobador {
  rol: string;
  rolLabel: string;
  email?: string | null;
  nombre?: string | null;
  estado: EstatusAprobador;
}

// Configuración de rol del usuario actual para una factura
export type RolEnFactura =
  | "responsable"
  | "cp"
  | "regisseur"
  | "coordo"
  | "dirAdj"
  | "dirGen"
  | "coo"
  | "admin"
  | "viewer";

// Session extendida con accessToken
declare module "next-auth" {
  interface Session {
    accessToken?: string;
  }
}
