// Lógica pura de la pantalla Estadísticas (sin base de datos ni React): arma los
// datos que dibujan los gráficos a partir de lo que ya devuelven las acciones de
// lib/actions/*. No cambia ningún cálculo de ganancia: solo los reordena para
// dibujarlos.

// ---------- Cascada de utilidad ----------
export type WaterfallKind = "total" | "down" | "final";
export type WaterfallStep = {
  label: string;
  // Monto con signo (negativo en los descuentos).
  value: number;
  kind: WaterfallKind;
  // Tramo vertical de la barra, en las mismas unidades que `value`.
  from: number;
  to: number;
};

// Ventas → − costo → − gastos → − comisión → utilidad. `from`/`to` son el
// nivel acumulado antes y después de cada paso (la barra flota entre ellos).
export function waterfallSteps(revenue: number, cogs: number, expenses: number, commissions: number): WaterfallStep[] {
  const profit = revenue - cogs - expenses - commissions;
  const steps: WaterfallStep[] = [{ label: "Ventas", value: revenue, kind: "total", from: 0, to: revenue }];
  let run = revenue;
  for (const [label, v] of [
    ["Costo", cogs],
    ["Gastos", expenses],
    ["Comisión", commissions],
  ] as const) {
    steps.push({ label, value: -v, kind: "down", from: run - v, to: run });
    run -= v;
  }
  steps.push({ label: "Utilidad", value: profit, kind: "final", from: Math.min(0, profit), to: Math.max(0, profit) });
  return steps;
}

// ---------- Pareto 80/20 ----------
export type ParetoRow<T> = T & { value: number; cumPct: number; inA: boolean };

// Ordena por valor (desc para «más», asc para «menos»), calcula el acumulado y
// marca la clase A: las filas hasta la primera que alcanza el 80 % (incluida).
export function paretoRows<T>(
  items: T[],
  valueOf: (t: T) => number,
  order: "desc" | "asc" = "desc"
): { rows: ParetoRow<T>[]; total: number; crossIndex: number } {
  const sorted = [...items].sort((a, b) => (order === "desc" ? valueOf(b) - valueOf(a) : valueOf(a) - valueOf(b)));
  const total = sorted.reduce((t, x) => t + Math.max(0, valueOf(x)), 0);
  let acc = 0;
  let crossIndex = -1;
  const rows = sorted.map((x, i) => {
    const value = Math.max(0, valueOf(x));
    acc += value;
    const cumPct = total > 0 ? acc / total : 0;
    if (crossIndex < 0 && total > 0 && cumPct >= 0.8 - 1e-9) crossIndex = i;
    return { ...x, value, cumPct, inA: false };
  });
  rows.forEach((r, i) => {
    r.inA = crossIndex >= 0 && i <= crossIndex;
  });
  return { rows, total, crossIndex };
}

// ---------- Distribución por monto de venta ----------
export const TICKET_BUCKET_LIMITS = [10, 20, 30, 50, 80] as const;

export function ticketBucketLabels(symbol: string): string[] {
  const l = TICKET_BUCKET_LIMITS;
  return [
    `${symbol}0-${l[0]}`,
    ...l.slice(1).map((v, i) => `${symbol}${l[i]}-${v}`),
    `${symbol}${l[l.length - 1]}+`,
  ];
}

// Rellena los 6 tramos (los que no vinieron de la base quedan en 0) y calcula
// el par de tramos vecinos que más ventas concentra, para la nota.
export function ticketHistogram(rows: { bucket: number; count: number }[]): {
  counts: number[];
  total: number;
  densest: { start: number; pct: number } | null;
} {
  const counts = Array.from({ length: TICKET_BUCKET_LIMITS.length + 1 }, () => 0);
  for (const r of rows) if (r.bucket >= 0 && r.bucket < counts.length) counts[r.bucket] += r.count;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return { counts, total, densest: null };
  let best = 0;
  for (let i = 1; i < counts.length - 1; i++) if (counts[i] + counts[i + 1] > counts[best] + counts[best + 1]) best = i;
  return { counts, total, densest: { start: best, pct: Math.round(((counts[best] + counts[best + 1]) / total) * 100) } };
}

// ---------- Ritmo por día de la semana y por hora ----------
export const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export type HeatCellLike = { dow: number; hour: number; count: number };

export function weekdayTotals(cells: HeatCellLike[]): number[] {
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const c of cells) if (c.dow >= 0 && c.dow < 7) out[c.dow] += c.count;
  return out;
}

// Horas de 8 a 20 (13 valores).
export function hourTotals(cells: HeatCellLike[], from = 8, to = 20): number[] {
  const out = Array.from({ length: to - from + 1 }, () => 0);
  for (const c of cells) if (c.hour >= from && c.hour <= to) out[c.hour - from] += c.count;
  return out;
}

// La franja de dos horas seguidas más fuerte y cuántas veces el promedio vende.
export function peakWindow(hours: number[], from = 8): { start: number; end: number; ratio: number } | null {
  const total = hours.reduce((a, b) => a + b, 0);
  if (total === 0 || hours.length < 2) return null;
  let best = 0;
  for (let i = 1; i < hours.length - 1; i++) if (hours[i] + hours[i + 1] > hours[best] + hours[best + 1]) best = i;
  const avg = total / hours.length;
  return { start: from + best, end: from + best + 2, ratio: (hours[best] + hours[best + 1]) / 2 / avg };
}

// «5 p. m.», «12 m.», «9 a. m.»
export function hourLabel(h: number): string {
  if (h === 12) return "12 m.";
  return h < 12 ? `${h} a. m.` : `${h - 12} p. m.`;
}

// ---------- Rotación ----------
export function periodDays(windows: { start: Date; end: Date }[], now: Date = new Date()): number {
  const ms = windows.reduce((t, w) => t + Math.max(0, Math.min(w.end.getTime(), now.getTime()) - w.start.getTime()), 0);
  return Math.max(1, Math.round(ms / 86_400_000));
}

// Días de inventario = stock ÷ venta diaria. 999 si no vendió nada.
export function inventoryDays(stock: number, sold: number, days: number): number {
  if (sold <= 0) return 999;
  return Math.round(Math.max(0, stock) / (sold / Math.max(1, days)));
}

export type RotationTone = "bad" | "warn" | "ok";
export function rotationStatus(daysLeft: number): { tone: RotationTone; label: string } {
  if (daysLeft < 10) return { tone: "bad", label: "Reponer" };
  if (daysLeft < 20) return { tone: "warn", label: "Vigilar" };
  return { tone: "ok", label: "Cubierto" };
}

// ---------- Margen por producto ----------
// Tercio superior en verde, el medio en la marca y el inferior en naranja (la
// preview usa umbrales fijos sobre datos de ejemplo; aquí son relativos).
export function marginTone(index: number, count: number): "ok" | "brand" | "warn" {
  if (count <= 0) return "brand";
  const pos = index / count;
  return pos < 1 / 3 ? "ok" : pos < 2 / 3 ? "brand" : "warn";
}

export function percentOf(part: number, total: number, digits = 1): number {
  if (total <= 0) return 0;
  const f = 10 ** digits;
  return Math.round((part / total) * 100 * f) / f;
}

// ---------- Gráfico de área ----------
// Convierte una serie en puntos dentro de un lienzo (x de izquierda a derecha,
// y invertida), y en la ruta suave de la línea y del área rellena.
export function seriesPoints(values: number[], w: number, h: number, pad = { l: 0, r: 0, t: 0, b: 0 }): [number, number][] {
  const max = Math.max(1, ...values);
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  const n = values.length;
  return values.map((v, i) => [pad.l + (n === 1 ? cw / 2 : (i / (n - 1)) * cw), pad.t + ch - (Math.max(0, v) / max) * ch]);
}

export function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
  let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${r(cx)},${r(y0)} ${r(cx)},${r(y1)} ${r(x1)},${r(y1)}`;
  }
  return d;
}

export function areaPath(pts: [number, number][], baseY: number): string {
  if (pts.length === 0) return "";
  return `${smoothPath(pts)} L${r(pts[pts.length - 1][0])},${r(baseY)} L${r(pts[0][0])},${r(baseY)} Z`;
}

function r(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------- Periodo ----------
const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type RangeLike =
  | { kind: "preset"; preset: "today" | "7d" | "month" }
  | { kind: "months"; year: number; months: number[] }
  | { kind: "range"; from: string; to: string };

// Etiqueta del periodo (la misma que usa Inicio): «Noviembre · día 18 de 30».
// `today` = día de hoy en la tienda (año, mes 1-12, día).
export function periodLabel(range: RangeLike, today: { year: number; month: number; day: number }): string {
  if (range.kind === "months") {
    if (range.months.length === 1) return `${cap(MONTH_NAMES[range.months[0] - 1])} ${range.year}`;
    return `${range.months.length} meses de ${range.year}`;
  }
  if (range.kind === "range") return `Del ${range.from} al ${range.to}`;
  if (range.preset === "today") return "Hoy";
  if (range.preset === "7d") return "Últimos 7 días";
  return `${cap(MONTH_NAMES[today.month - 1])} · día ${today.day} de ${new Date(today.year, today.month, 0).getDate()}`;
}

// Proyección a fin de mes (solo periodo «Mes»): lo vendido ÷ días transcurridos × días del mes.
export function monthProjection(revenue: number, today: { year: number; month: number; day: number }): number {
  const dim = new Date(today.year, today.month, 0).getDate();
  return Math.round((revenue / Math.max(1, today.day)) * dim);
}

function cap(x: string): string {
  return x.charAt(0).toUpperCase() + x.slice(1);
}

export function currencySymbol(code: string): string {
  return code === "EUR" ? "€" : "$";
}

// «+12,4 %» / «−8 %» con coma decimal.
export function signedPct(pct: number): string {
  const abs = Math.abs(pct).toLocaleString("es-VE", { maximumFractionDigits: 1 });
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${abs} %`;
}

// Variación porcentual redondeada (null si no hay base para comparar).
export function deltaPct(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}
