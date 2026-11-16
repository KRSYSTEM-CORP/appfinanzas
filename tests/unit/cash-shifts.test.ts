import { describe, expect, it } from "vitest";
import { activeShiftNumber, isDayClosed, nextShiftNumber, shiftWindow } from "@/lib/cash-shifts";

const d = (s: string) => new Date(s);
const dayStart = d("2026-11-16T04:00:00Z");
const dayEnd = d("2026-11-17T04:00:00Z");

describe("turnos de caja", () => {
  it("sin aperturas ni cierres: no hay turno activo y el siguiente es el 1", () => {
    expect(activeShiftNumber([], [])).toBeNull();
    expect(nextShiftNumber([], [])).toBe(1);
    expect(isDayClosed([], [])).toBe(false);
  });

  it("apertura sin cierre es el turno activo y el día no está cerrado", () => {
    const o = [{ shiftNumber: 1 }];
    expect(activeShiftNumber(o, [])).toBe(1);
    expect(isDayClosed(o, [])).toBe(false);
  });

  it("tras cerrar el turno 1 se puede abrir el 2 el mismo día", () => {
    const o = [{ shiftNumber: 1 }];
    const c = [{ shiftNumber: 1, closedAt: d("2026-11-16T16:00:00Z") }];
    expect(activeShiftNumber(o, c)).toBeNull();
    expect(isDayClosed(o, c)).toBe(true);
    expect(nextShiftNumber(o, c)).toBe(2);
    const o2 = [...o, { shiftNumber: 2 }];
    expect(activeShiftNumber(o2, c)).toBe(2);
    expect(isDayClosed(o2, c)).toBe(false);
  });

  it("un cierre heredado sin apertura cuenta como día cerrado", () => {
    expect(isDayClosed([], [{ shiftNumber: 1, closedAt: d("2026-11-16T20:00:00Z") }])).toBe(true);
  });

  it("la ventana de cada turno solo cubre sus propias ventas", () => {
    const closings = [
      { shiftNumber: 1, closedAt: d("2026-11-16T16:00:00Z") },
      { shiftNumber: 2, closedAt: d("2026-11-16T22:00:00Z") },
    ];
    expect(shiftWindow(1, dayStart, dayEnd, closings)).toEqual({ start: dayStart, end: d("2026-11-16T16:00:00Z") });
    expect(shiftWindow(2, dayStart, dayEnd, closings)).toEqual({ start: d("2026-11-16T16:00:00Z"), end: d("2026-11-16T22:00:00Z") });
    // turno 3 abierto: arranca al cerrar el 2 y llega hasta ahora
    const now = d("2026-11-16T23:00:00Z");
    expect(shiftWindow(3, dayStart, dayEnd, closings, now)).toEqual({ start: d("2026-11-16T22:00:00Z"), end: now });
  });

  it("un cierre de un día pasado no se sale del día", () => {
    const closings = [{ shiftNumber: 1, closedAt: d("2026-11-20T10:00:00Z") }];
    expect(shiftWindow(1, dayStart, dayEnd, closings).end).toEqual(dayEnd);
  });
});
