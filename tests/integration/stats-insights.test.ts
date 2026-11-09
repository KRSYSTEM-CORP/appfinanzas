import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, sessionFor, type Ctx } from "./helpers";

let ctx: Ctx;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({
  getSession: async () => sessionFor(ctx),
  requireSession: async () => sessionFor(ctx),
  requireManager: async () => sessionFor(ctx),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { salesByPaymentMethod, mostPurchasedProducts, inventoryRotation } = await import("@/lib/actions/reports");

// Todo el año actual: así entra cualquier dato de la base de pruebas.
const YEAR = { kind: "months" as const, year: new Date().getFullYear(), months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };

beforeAll(async () => {
  ctx = await loadContext();
});

describe("estadísticas: distribución, más comprados y rotación", () => {
  it("la distribución de ventas corre y viene ordenada de mayor a menor", async () => {
    const mix = await salesByPaymentMethod(YEAR);
    expect(Array.isArray(mix)).toBe(true);
    for (const r of mix) {
      expect(typeof r.method).toBe("string");
      expect(r.totalCents).toBeGreaterThanOrEqual(0);
      expect(r.count).toBeGreaterThan(0);
    }
    const totals = mix.map((r) => r.totalCents);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
  });

  it("los más comprados respetan el límite y vienen ordenados por unidades", async () => {
    const rows = await mostPurchasedProducts(YEAR, 3);
    expect(rows.length).toBeLessThanOrEqual(3);
    const q = rows.map((r) => r.quantity);
    expect([...q].sort((a, b) => b - a)).toEqual(q);
  });

  it("la rotación es unidades vendidas ÷ stock (mínimo 1) y viene de mayor a menor", async () => {
    const rows = await inventoryRotation(YEAR, 5);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const r of rows) {
      expect(r.turns).toBeCloseTo(Math.round((r.sold / Math.max(r.stock, 1)) * 100) / 100, 5);
    }
    const t = rows.map((r) => r.turns);
    expect([...t].sort((a, b) => b - a)).toEqual(t);
  });
});
