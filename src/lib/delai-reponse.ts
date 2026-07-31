/**
 * Plazo de respuesta del proveedor.
 *
 * La página `/facture/{nº}` es pública y su URL es deducible a propósito. Acotarla en el
 * tiempo limita cuánto dura esa exposición: pasado el plazo, el enlace sigue mostrando la
 * factura pero **ya no acepta respuesta**.
 *
 * El plazo se ancla en `Factura.createdAt` — la fecha en que se procesó el correo por
 * primera vez — y **no se mueve nunca**. Decisión del cliente (2026-07-30): si acostasalcedo
 * reenvía el mismo certificat, la factura se actualiza pero el plazo se mantiene, para que un
 * enlace ya vencido no pueda revivir sin que nadie se dé cuenta.
 *
 * El vencimiento es un **instante exacto** (`createdAt` + 30 días), no "el final del día 30".
 * Es a propósito: el servidor corre en UTC y el destinatario está en Montréal, así que
 * cualquier regla de "fin del día" daría un corte distinto según dónde corra el proceso.
 * Con un instante exacto no hay ambigüedad; la hora se muestra siempre en horario de Montréal
 * (`formatDateHeure`), de modo que el proveedor lee el límite en su propia hora.
 */

import { addDays } from "date-fns";

export const JOURS_POUR_REPONDRE = 30;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

export function dateLimiteReponse(dateTraitement: Date): Date {
  return addDays(dateTraitement, JOURS_POUR_REPONDRE);
}

export interface DelaiReponse {
  /** Instante exacto a partir del cual ya no se acepta respuesta. */
  limite: Date;
  expire: boolean;
  /** Días que quedan, redondeados hacia arriba: mientras quede algo de plazo es ≥ 1. */
  joursRestants: number;
}

export function delaiReponse(
  dateTraitement: Date,
  maintenant: Date = new Date()
): DelaiReponse {
  const limite = dateLimiteReponse(dateTraitement);
  const restant = limite.getTime() - maintenant.getTime();

  return {
    limite,
    expire: restant <= 0,
    joursRestants: Math.max(0, Math.ceil(restant / MS_PAR_JOUR)),
  };
}
