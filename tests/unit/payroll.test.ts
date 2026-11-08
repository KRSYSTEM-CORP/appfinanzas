import { describe, expect, it } from "vitest";
import {
  accruedProvisionCents,
  computeFortnight,
  isValidPeriod,
  monthlyProvisionCents,
  periodFor,
  periodLabel,
} from "@/lib/payroll";

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
  it("usa los porcentajes de la empresa", () => {
    // 10 % de deducción sobre la mitad del sueldo base (100) = 10
    const c = computeFortnight(20000, 0, 0, { ivssPct: 5, paroPct: 2, faovPct: 3 });
    expect(c.deductionsCents).toBe(1000);
    expect(c.netCents).toBe(10000 - 1000);
  });
  it("calcula las provisiones", () => {
    expect(monthlyProvisionCents(12000)).toBe(1000);
    expect(accruedProvisionCents(12000, 10)).toBe(10000);
    expect(accruedProvisionCents(12000, 20)).toBe(12000);
    expect(accruedProvisionCents(12000, 0)).toBe(0);
  });
});
