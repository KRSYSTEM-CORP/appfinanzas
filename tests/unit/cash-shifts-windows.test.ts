import { describe, it, expect } from "vitest";
import { activeShiftNumber, isDayClosed, shiftWindow } from "@/lib/cash-shifts";
import { dayBoundsUtc } from "@/lib/report-types";

describe("ventanas de turno (America/Caracas)", () => {
  const { start, end } = dayBoundsUtc("2026-11-10");
  it("el día Caracas empieza a las 04:00 UTC", () => {
    expect(start.toISOString()).toBe("2026-11-10T04:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(24 * 3600_000);
  });
  it("turnos consecutivos no se solapan", () => {
    const c1 = { shiftNumber: 1, closedAt: new Date("2026-11-10T20:00:00Z") };
    const w1 = shiftWindow(1, start, end, [c1]);
    const w2 = shiftWindow(2, start, end, [c1], new Date("2026-11-10T23:00:00Z"));
    expect(w1.end).toEqual(w2.start);
    expect(w2.end.toISOString()).toBe("2026-11-10T23:00:00.000Z");
  });
  it("día cerrado solo sin turno abierto", () => {
    const c = [{ shiftNumber: 1, closedAt: new Date() }];
    expect(isDayClosed([{ shiftNumber: 1 }], c)).toBe(true);
    expect(isDayClosed([{ shiftNumber: 1 }, { shiftNumber: 2 }], c)).toBe(false);
    expect(activeShiftNumber([{ shiftNumber: 1 }, { shiftNumber: 2 }], c)).toBe(2);
  });
});
