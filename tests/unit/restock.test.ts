import { describe, expect, it } from "vitest";
import { restockPlan } from "@/lib/restock";

describe("restockPlan", () => {
  it("producto nuevo con un día de ventas no dispara cantidades enormes", () => {
    const p = restockPlan({ sold: 40, activeDays: 1, stock: 8, minStock: 5 });
    expect(p.perDay).toBeCloseTo(40 / 7);
    expect(p.ideal).toBe(40);
    expect(p.need).toBe(32);
  });
  it("respeta el mínimo configurado", () => {
    const p = restockPlan({ sold: 2, activeDays: 30, stock: 1, minStock: 10 });
    expect(p.ideal).toBe(10);
    expect(p.need).toBe(9);
  });
  it("no pide si hay existencia suficiente", () => {
    expect(restockPlan({ sold: 30, activeDays: 30, stock: 20, minStock: 5 }).need).toBe(0);
  });
});
