import type { DateRangeSelection } from "@/lib/report-types";

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// «Noviembre · día 18 de 30» a partir de una fecha «AAAA-MM-DD» (día de Venezuela).
export function monthProgressLabel(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${MONTHS[m - 1]} · día ${d} de ${days}`;
}

// «18 nov» a partir de «AAAA-MM-DD».
export function shortDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${SHORT[m - 1]}`;
}

// Etiqueta del periodo elegido, para la pill con calendario que acompaña al selector.
export function selectionLabel(sel: DateRangeSelection, today: string): string {
  if (sel.kind === "preset") {
    if (sel.preset === "month") return monthProgressLabel(today);
    if (sel.preset === "today") return `Hoy · ${shortDay(today)}`;
    return "Últimos 7 días";
  }
  if (sel.kind === "months") {
    const names = [...sel.months].sort((a, b) => a - b).map((m) => MONTHS[m - 1]);
    return names.length === 1 ? `${names[0]} ${sel.year}` : `${names.length} meses de ${sel.year}`;
  }
  return `${shortDay(sel.from)} – ${shortDay(sel.to)}`;
}
