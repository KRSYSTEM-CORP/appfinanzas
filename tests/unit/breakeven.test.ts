import { describe, expect, it } from "vitest";
import { breakevenByCategory, marginRatio, revenueNeeded } from "@/lib/breakeven";

describe("punto de equilibrio", () => {
  it("calcula el margen", () => {
    expect(marginRatio(1000, 600)).toBeCloseTo(0.4);
    expect(marginRatio(0, 0)).toBe(0);
    expect(marginRatio(100, 150)).toBe(0);
  });
  it("calcula las ventas necesarias", () => {
    expect(revenueNeeded(400, 0.4)).toBe(1000);
    expect(revenueNeeded(400, 0)).toBeNull();
  });
  it("reparte los gastos por categoría y marca cuáles cubre", () => {
    const rows = breakevenByCategory(
      [
        { category: "Ropa", revenueCents: 8000, cogsCents: 4000 },
        { category: "Accesorios", revenueCents: 2000, cogsCents: 1800 },
      ],
      1000
    );
    expect(rows[0].category).toBe("Ropa");
    expect(rows[0].allocatedExpensesCents).toBe(800);
    expect(rows[0].breakevenCents).toBe(1600);
    expect(rows[0].covered).toBe(true);
    expect(rows[1].allocatedExpensesCents).toBe(200);
    expect(rows[1].breakevenCents).toBe(2000);
    expect(rows[1].covered).toBe(true);
  });
});
