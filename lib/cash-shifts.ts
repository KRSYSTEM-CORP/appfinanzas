// Lógica pura de turnos de caja: varios turnos por día y sede, nunca dos abiertos
// a la vez. Un turno = una apertura (CashOpening) + su cierre (CashClosing) con el
// mismo shiftNumber. Sin dependencias de servidor para poder probarla en vitest.

export type ShiftOpeningLike = { shiftNumber: number };
export type ShiftClosingLike = { shiftNumber: number; closedAt: Date };

// Turno abierto: el de mayor número con apertura y sin cierre.
export function activeShiftNumber(openings: ShiftOpeningLike[], closings: ShiftClosingLike[]): number | null {
  const closed = new Set(closings.map((c) => c.shiftNumber));
  const open = openings.filter((o) => !closed.has(o.shiftNumber)).map((o) => o.shiftNumber);
  return open.length > 0 ? Math.max(...open) : null;
}

// Número del próximo turno a abrir (o a cerrar si no hubo apertura).
export function nextShiftNumber(openings: ShiftOpeningLike[], closings: ShiftClosingLike[]): number {
  const all = [...openings.map((o) => o.shiftNumber), ...closings.map((c) => c.shiftNumber)];
  return all.length > 0 ? Math.max(...all) + 1 : 1;
}

// El día está cerrado cuando hay al menos un cierre y ningún turno sigue abierto.
export function isDayClosed(openings: ShiftOpeningLike[], closings: ShiftClosingLike[]): boolean {
  return closings.length > 0 && activeShiftNumber(openings, closings) == null;
}

const min = (a: Date, b: Date) => (a < b ? a : b);
const max = (a: Date, b: Date) => (a > b ? a : b);

// Ventana de tiempo [start, end) de un turno dentro del día. Empieza al cerrar el
// turno anterior (o a medianoche en el primero) y termina al cerrar el propio
// (o al final del día / ahora si sigue abierto). Así cada venta cae en un solo turno.
export function shiftWindow(
  shiftNumber: number,
  dayStart: Date,
  dayEnd: Date,
  closings: ShiftClosingLike[],
  now?: Date
): { start: Date; end: Date } {
  const prev = closings
    .filter((c) => c.shiftNumber < shiftNumber)
    .sort((a, b) => b.shiftNumber - a.shiftNumber)[0];
  const start = prev ? max(min(prev.closedAt, dayEnd), dayStart) : dayStart;
  const own = closings.find((c) => c.shiftNumber === shiftNumber);
  let end = own ? min(own.closedAt, dayEnd) : dayEnd;
  if (!own && now) end = min(now, dayEnd);
  return { start, end: max(end, start) };
}
