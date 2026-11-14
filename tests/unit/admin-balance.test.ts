import { describe, expect, it } from "vitest";
import { breakevenMeter, breakevenPoint, monthProjection, netProfit, waterfall } from "@/lib/admin-balance";

const b = { salesCents: 482000, cogsCents: 269000, expensesCents: 86000, commissionsCents: 15000 };

describe("Resumen de Balance", () => {
  it("ganancia neta = ventas − costo − gastos − comisiones", () => {
    expect(netProfit(b)).toBe(112000);
  });
  it("punto de equilibrio como la preview ($2.286)", () => {
    expect(Math.round(breakevenPoint(b)! / 100)).toBe(2286);
    expect(breakevenPoint({ ...b, salesCents: 0 })).toBeNull();
    expect(breakevenPoint({ ...b, cogsCents: 500000 })).toBeNull();
  });
  it("proyección 4.820 ÷ 18 × 30 = 8.033", () => {
    expect(Math.round(monthProjection(482000, 18, 30) / 100)).toBe(8033);
  });
  it("medidor con las mismas proporciones que la preview", () => {
    const m = breakevenMeter(482000, breakevenPoint(b), monthProjection(482000, 18, 30));
    expect(m.projection).toBeCloseTo(92.59, 1);
    expect(m.fill).toBeCloseTo(55.55, 0);
    expect(m.marker).toBeCloseTo(26.34, 0);
  });
  it("cascada en el lienzo de 220px", () => {
    const w = waterfall(b);
    expect(w.map((x) => x.label)).toEqual(["Ventas", "Costo", "Gastos", "Comisión", "Utilidad"]);
    expect(w[0].h).toBe(220);
    expect(w[1].h).toBeCloseTo(122.78, 1);
    expect(w[4].y).toBeCloseTo(202.88, 1);
    expect(w[4].tone).toBe("ok");
  });
});
