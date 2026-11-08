import { describe, expect, it } from "vitest";
import { computeFortnight, isValidPeriod, periodFor, periodLabel } from "@/lib/payroll";

describe("nómina quincenal", () => {
  it("calcula bruto, deducciones y neto", () => {
    // base $200, bono $20 → quincena: 100 + 10 = 110; deducciones 5,5 % de 100 = 5,50
    const c = computeFortnight(20000, 2000);
    expect(c.grossCents).toBe(11000);
    expect(c.deductionsCents).toBe(550);
    expect(c.netCents).toBe(10450);
  });
  it("descuenta el adelanto sin dejar el neto en negativo", () => {
    expect(computeFortnight(20000, 0, 3000).netCents).toBe(10000 - 550 - 3000);
    expect(computeFortnight(20000, 0, 999999).netCents).toBe(0);
  });
  it("identifica la quincena", () => {
    expect(periodFor(new Date(2026, 10, 15))).toBe("2026-11-1");
    expect(periodFor(new Date(2026, 10, 16))).toBe("2026-11-2");
    expect(isValidPeriod("2026-11-2")).toBe(true);
    expect(isValidPeriod("2026-13-1")).toBe(false);
    expect(periodLabel("2026-11-2")).toBe("2.ª quincena de noviembre 2026");
  });
});
