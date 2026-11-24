import { describe, it, expect } from "vitest";
import { scaleLinesToTotal, scaleLooksWrong, baseUnitCost } from "@/lib/purchase-math";

describe("purchase-math", () => {
  it("el IVA por línea suma el IVA total y base + IVA = total", () => {
    const lines = [
      { subtotalCents: 333, baseCents: 287, taxCents: 46 },
      { subtotalCents: 333, baseCents: 287, taxCents: 46 },
      { subtotalCents: 334, baseCents: 288, taxCents: 46 },
    ];
    const r = scaleLinesToTotal(lines, 1.2345, 1235);
    expect(r.lines.reduce((n, l) => n + l.subtotalCents, 0)).toBe(1235);
    expect(r.baseTotalCents + r.taxTotalCents).toBe(1235);
    for (const l of r.lines) expect(l.baseCents + l.taxCents).toBe(l.subtotalCents);
  });
  it("detecta factores absurdos", () => {
    expect(scaleLooksWrong(1.1)).toBe(false);
    expect(scaleLooksWrong(40)).toBe(true);
    expect(scaleLooksWrong(0.02)).toBe(true);
  });
  it("costo base unitario", () => {
    expect(baseUnitCost(1000, 4)).toBe(250);
    expect(baseUnitCost(1000, 0)).toBe(0);
  });
});
