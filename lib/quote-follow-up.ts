// Motivos de pérdida de un presupuesto (lista cerrada, como en la preview).
export const QUOTE_LOST_REASONS = ["Precio", "Compró en otro lado", "No respondió", "Cambió de idea"] as const;
export type QuoteLostReason = (typeof QUOTE_LOST_REASONS)[number];
// Motivos de presupuestos anteriores: se siguen leyendo y mostrando.
export const QUOTE_LOST_REASONS_LEGACY = ["Sin respuesta", "Otro"] as const;

export const QUOTE_VALID_DAYS = [7, 15, 30] as const;

export const FOLLOW_UP_KINDS = {
  CALL: "Llamé",
  WHATSAPP: "Escribí por WhatsApp",
  NOTE: "Nota",
} as const;
export type FollowUpKind = keyof typeof FOLLOW_UP_KINDS;

// Días hasta que vence (negativo = vencido hace N días); null si no tiene vigencia.
export function daysToExpire(validUntil: Date | string | null, now: Date = new Date()): number | null {
  if (!validUntil) return null;
  return Math.ceil((new Date(validUntil).getTime() - now.getTime()) / 86_400_000);
}

export function expiryLabel(days: number | null): string | null {
  if (days == null) return null;
  if (days > 0) return `Vence en ${days} ${days === 1 ? "día" : "días"}`;
  if (days === 0) return "Vence hoy";
  return `Vencido hace ${-days} ${-days === 1 ? "día" : "días"}`;
}

// Sugerencia de siguiente paso de un presupuesto abierto.
export function nextStepSuggestion(q: { status: string; sentAt: Date | string | null; viewedAt: Date | string | null; validUntil: Date | string | null }): string | null {
  if (q.status !== "PENDING") return null;
  const d = daysToExpire(q.validUntil);
  if (d != null && d < 0) return "Venció: ofrécele renovarlo o márcalo como perdido.";
  if (d != null && d <= 2) return "Está por vencer: llama hoy y cierra la venta.";
  if (!q.sentAt) return "Aún no lo envías: mándalo por WhatsApp.";
  if (!q.viewedAt) return "Aún no lo abre: reenvía por WhatsApp o llama.";
  return "Ya lo vio: pregunta si tiene dudas y propón cerrar.";
}
