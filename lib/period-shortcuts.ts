// Atajos del selector de periodo (Rango y Meses). Fechas como «AAAA-MM-DD» en días de
// Venezuela; la aritmética se hace en UTC para no depender de la zona del navegador.

const DAY = 86_400_000;

function toMs(d: string): number {
  return Date.parse(`${d}T00:00:00Z`);
}
function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  return fromMs(toMs(d) + n * DAY);
}

// 0 = lunes … 6 = domingo.
export function weekdayMon0(d: string): number {
  return (new Date(toMs(d)).getUTCDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export type RangeShortcut = "ayer" | "semana" | "semana-pasada" | "q1" | "q2" | "mes-pasado";

export const RANGE_SHORTCUTS: { key: RangeShortcut; label: string }[] = [
  { key: "ayer", label: "Ayer" },
  { key: "semana", label: "Esta semana" },
  { key: "semana-pasada", label: "Semana pasada" },
  { key: "q1", label: "1.ª quincena" },
  { key: "q2", label: "2.ª quincena" },
  { key: "mes-pasado", label: "Mes pasado" },
];

export function rangeForShortcut(key: RangeShortcut, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const dow = weekdayMon0(today);
  switch (key) {
    case "ayer":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "semana":
      return { from: addDays(today, -dow), to: today };
    case "semana-pasada":
      return { from: addDays(today, -dow - 7), to: addDays(today, -dow - 1) };
    case "q1":
      return { from: ymd(y, m, 1), to: ymd(y, m, 15) };
    case "q2":
      return { from: ymd(y, m, 16), to: ymd(y, m, daysInMonth(y, m)) };
    case "mes-pasado": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: ymd(py, pm, 1), to: ymd(py, pm, daysInMonth(py, pm)) };
    }
  }
}

export type MonthsShortcut = "este" | "3" | "6" | "anio";

export const MONTHS_SHORTCUTS: { key: MonthsShortcut; label: string }[] = [
  { key: "este", label: "Este mes" },
  { key: "3", label: "Últimos 3 meses" },
  { key: "6", label: "Últimos 6 meses" },
  { key: "anio", label: "Todo el año" },
];

// Meses (1-12) del año en curso que cubre el atajo, sin pasar del mes actual.
export function monthsForShortcut(key: MonthsShortcut, currentMonth: number): number[] {
  const count = key === "este" ? 1 : key === "3" ? 3 : key === "6" ? 6 : currentMonth;
  const from = Math.max(1, currentMonth - count + 1);
  return Array.from({ length: currentMonth - from + 1 }, (_, i) => from + i);
}
