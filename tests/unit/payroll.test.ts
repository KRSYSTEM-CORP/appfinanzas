import { describe, expect, it } from "vitest";
import {
  accruedProvisionCents,
  computeFortnight,
  isValidPeriod,
  monthlyProvisionCents,
  periodFor,
  periodLabel,
  commissionFor,
  periodDateRange,
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
  it("suma la comisión a las asignaciones sin tocar las deducciones", () => {
    // base 200 → quincena 100; comisión 3 % de 1.000 = 30; deducciones 5,5 % de 100
    const c = computeFortnight(20000, 0, 0, undefined, commissionFor(100000, 3));
    expect(c.commissionCents).toBe(3000);
    expect(c.grossCents).toBe(10000 + 3000);
    expect(c.deductionsCents).toBe(550);
    expect(c.netCents).toBe(13000 - 550);
  });
  it("calcula la comisión y las fechas de la quincena", () => {
    expect(commissionFor(0, 5)).toBe(0);
    expect(commissionFor(50000, 0)).toBe(0);
    expect(commissionFor(33333, 3)).toBe(1000);
    expect(periodDateRange("2026-11-1")).toEqual({ from: "2026-11-01", to: "2026-11-15" });
    expect(periodDateRange("2026-11-2")).toEqual({ from: "2026-11-16", to: "2026-11-30" });
    expect(periodDateRange("2028-02-2")).toEqual({ from: "2028-02-16", to: "2028-02-29" });
  });
});
