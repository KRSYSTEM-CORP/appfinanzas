// Reglas puras (sin base de datos) que completeSale aplica en el servidor.

/** Tope de descuento manual (sin cupón) para quien no es gerente. */
export const MAX_SELLER_DISCOUNT_PERCENT = 30;
/** Banda aceptada para la tasa de una venta encolada sin internet (respecto a la tasa actual). */
export const OFFLINE_RATE_BAND = 0.1;
/** Una venta encolada más vieja que esto se sincroniza con fecha de hoy y tasa actual. */
export const MAX_QUEUE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Devuelve el mensaje de error si el descuento no está permitido, o null. */
export function discountPolicyError(opts: {
  discountPercent: number;
  hasCoupon: boolean;
  isManager: boolean;
  note?: string | null;
}): string | null {
  const { discountPercent, hasCoupon, isManager, note } = opts;
  if (discountPercent <= 0 || hasCoupon) return null;
  if (discountPercent >= 100) {
    if (!isManager) return "Solo un gerente puede exonerar una venta (descuento del 100 %).";
    if ((note ?? "").trim().length < 3) return "Escribe el motivo de la exoneración.";
    return null;
  }
  if (!isManager && discountPercent > MAX_SELLER_DISCOUNT_PERCENT) {
    return `El descuento máximo sin autorización es ${MAX_SELLER_DISCOUNT_PERCENT} %.`;
  }
  return null;
}

/** Fecha original de una venta encolada, solo si es razonable; si no, null (se usa la actual). */
export function sanitizeQueuedAt(queuedAt: string | undefined, now: Date = new Date()): Date | null {
  if (!queuedAt) return null;
  const d = new Date(queuedAt);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  if (t > now.getTime() + FUTURE_SKEW_MS) return null;
  if (now.getTime() - t > MAX_QUEUE_AGE_MS) return null;
  return d;
}

/** ¿Se acepta la tasa que mandó el dispositivo? Solo en ventas encoladas y cerca de la tasa actual. */
export function isOfflineRateAcceptable(
  offlineRate: number | undefined | null,
  companyRate: number | null,
  isQueued: boolean
): boolean {
  if (!isQueued || offlineRate == null || companyRate == null || !(companyRate > 0)) return false;
  return offlineRate >= companyRate * (1 - OFFLINE_RATE_BAND) && offlineRate <= companyRate * (1 + OFFLINE_RATE_BAND);
}
