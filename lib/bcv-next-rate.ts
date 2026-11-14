// «Próxima tasa» de Ajustes: el BCV publica por la tarde la tasa del día hábil siguiente
// («fecha valor»). Todo aquí es puro (sin red) para poder probarlo.
import { todayVe, type BcvHome } from "@/lib/bcv-parse";

export type BcvNextRate = { rate: number; valueDate: string };

export type BcvOfficialInfo = {
  // Fecha valor de la tasa que está activa, si coincide con la publicada por el BCV.
  currentValueDate: string | null;
  // Tasa ya publicada con fecha valor posterior a hoy y distinta de la activa.
  next: BcvNextRate | null;
};

const SAME_RATE_EPSILON = 0.0001;

export function classifyBcvRates(
  official: BcvHome,
  reference: "USD" | "EUR",
  currentRate: number | null,
  now: Date = new Date()
): BcvOfficialInfo {
  const published = reference === "USD" ? official.usd : official.eur;
  const matches = currentRate != null && Math.abs(currentRate - published) < SAME_RATE_EPSILON;
  if (matches) return { currentValueDate: official.valueDate, next: null };
  if (official.valueDate > todayVe(now)) return { currentValueDate: null, next: { rate: published, valueDate: official.valueDate } };
  return { currentValueDate: null, next: null };
}

// «2026-11-09» → «lunes 9 nov» (sin zona horaria: la fecha valor es un día de calendario).
export function formatValueDate(valueDate: string): string {
  const [y, m, d] = valueDate.split("-").map(Number);
  if (!y || !m || !d) return valueDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = new Intl.DateTimeFormat("es-VE", { weekday: "long", timeZone: "UTC" }).format(date);
  const month = new Intl.DateTimeFormat("es-VE", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
  return `${weekday} ${d} ${month}`;
}
