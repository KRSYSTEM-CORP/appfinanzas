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
export function nextStepSuggestion(q: { status: string; sentAt: Date | string | null; viewedAt: Date | string | null; validUntil: Date | string | null }, now: Date = new Date()): string | null {
  if (q.status !== "PENDING") return null;
  const d = daysToExpire(q.validUntil, now);
  if (d != null && d < 0) return "Venció: ofrece renovarlo con 5 % para cerrarlo.";
  if (!q.viewedAt) return "Aún no lo abre: reenvía por WhatsApp con un mensaje corto.";
  if (d != null && d <= 4) return "Está por vencer: llama hoy y confirma.";
  return "Lo abrió: escríbele para resolver dudas.";
}

export type QuotePillTone = "ok" | "warn" | "bad";

// Píldora de vigencia de la tarjeta: Vigente · N d / Vence en N d / Vencido hace N d.
export function expiryPill(days: number | null): { label: string; tone: QuotePillTone } | null {
  if (days == null) return null;
  if (days < 0) return { label: `Vencido hace ${-days} d`, tone: "bad" };
  if (days <= 4) return { label: `Vence en ${days} d`, tone: "warn" };
  return { label: `Vigente · ${days} d`, tone: "ok" };
}

// Probabilidad de cierre (5 a 95) según los días que lleva, si ya se envió o abrió y cuántos
// seguimientos se registraron. Estimación calculada con datos reales del presupuesto.
export function closeProbability(
  q: { status: string; createdAt: Date | string; sentAt: Date | string | null; viewedAt: Date | string | null; validUntil: Date | string | null },
  followUps = 0,
  now: Date = new Date()
): number {
  if (q.status === "CONVERTED") return 100;
  if (q.status === "LOST") return 0;
  let p = 40;
  if (q.sentAt) p += 10;
  if (q.viewedAt) p += 20;
  p += Math.min(3, followUps) * 5;
  const age = Math.max(0, Math.floor((now.getTime() - new Date(q.createdAt).getTime()) / 86_400_000));
  p -= Math.min(20, age * 2);
  const d = daysToExpire(q.validUntil, now);
  if (d != null && d < 0) p = Math.min(p, 25);
  return Math.max(5, Math.min(95, Math.round(p)));
}
