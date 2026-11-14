import { describe, expect, it } from "vitest";
import { expenseComposition, netProfit, waterfall } from "@/lib/admin-balance";

const b = { salesCents: 482000, cogsCents: 269000, expensesCents: 86000, commissionsCents: 15000 };

describe("Resumen de Balance", () => {
  it("ganancia neta = ventas − costo − gastos − comisiones", () => {
    expect(netProfit(b)).toBe(112000);
  });
  it("composición de gastos: agrupa, ordena y recorta en «Otros»", () => {
    const rows = [
      { category: "Alquiler", amountCents: 500 },
      { category: "Nómina", amountCents: 300 },
      { category: "Alquiler", amountCents: 200 },
      { category: null, amountCents: 100 },
      { category: " ", amountCents: 50 },
      { category: "Luz", amountCents: 40 },
      { category: "Agua", amountCents: 10 },
      { category: "Basura", amountCents: 0 },
    ];
    const full = expenseComposition(rows, 10);
    expect(full.total).toBe(1200);
    expect(full.slices.map((s) => s.label)).toEqual(["Alquiler", "Nómina", "Sin categoría", "Luz", "Agua"]);
    expect(full.slices[0]).toMatchObject({ cents: 700 });
    const cut = expenseComposition(rows, 3);
    expect(cut.slices.map((s) => s.label)).toEqual(["Alquiler", "Nómina", "Otros"]);
    expect(cut.slices[2].cents).toBe(200);
    expect(cut.slices.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1);
    expect(expenseComposition([])).toEqual({ slices: [], total: 0 });
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
