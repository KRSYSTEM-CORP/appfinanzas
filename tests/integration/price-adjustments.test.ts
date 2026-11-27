import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";

let ctx: Ctx;
let asSeller = false;
vi.mock("@/lib/session", () => ({
  requireManager: async () => {
    if (asSeller) throw new Error("NEXT_REDIRECT");
    return { ...sessionFor(ctx), branchId: null };
  },
  requireSession: async () => sessionFor(ctx),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/realtime", () => ({ notifyLive: async () => {}, posChannel: (id: string) => id }));

const { previewPriceIncrease, bulkIncreasePrices, undoLastPriceAdjustment, getLastPriceAdjustment } = await import("@/lib/actions/price-adjustments");

let backup: { id: string; priceCents: number; wholesalePriceCents: number | null; bulkPriceCents: number | null; isActive: boolean }[] = [];
let tierId: string;

beforeAll(async () => {
  ctx = await loadContext();
  const all = await owner.product.findMany({
    where: { companyId: ctx.companyId },
    select: { id: true, priceCents: true, wholesalePriceCents: true, bulkPriceCents: true, isActive: true },
  });
  backup = all;
  await owner.priceAdjustment.deleteMany({ where: { companyId: ctx.companyId } });
  tierId = all[0].id;
  // Un producto con precio por mayor para comprobar que también sube.
  await owner.product.update({ where: { id: tierId }, data: { priceCents: 1000, wholesalePriceCents: 900, bulkPriceCents: null, isActive: true } });
});

afterAll(async () => {
  for (const b of backup) {
    await owner.product.update({ where: { id: b.id }, data: { priceCents: b.priceCents, wholesalePriceCents: b.wholesalePriceCents, bulkPriceCents: b.bulkPriceCents, isActive: b.isActive } });
  }
  await owner.priceAdjustment.deleteMany({ where: { companyId: ctx.companyId } });
  await owner.$disconnect();
});

async function prices() {
  const rows = await owner.product.findMany({ where: { companyId: ctx.companyId }, select: { id: true, priceCents: true, wholesalePriceCents: true, costCents: true } });
  return new Map(rows.map((r) => [r.id, r]));
}

describe("aumentar precios en porcentaje", () => {
  it("rechaza porcentajes inválidos", async () => {
    for (const percent of ["0", "150", "abc"]) {
      const r = await bulkIncreasePrices({ percent, rounding: "CENT" });
      expect(r.success).toBe(false);
    }
  });

  it("la vista previa no escribe y coincide con lo aplicado", async () => {
    const before = await prices();
    const pv = await previewPriceIncrease({ percent: "10", rounding: "CENT" });
    expect(pv.success).toBe(true);
    if (!pv.success) return;
    expect(pv.count).toBe(backup.filter((b) => b.isActive).length);
    expect(pv.samples.length).toBeGreaterThan(0);
    expect(await prices()).toEqual(before);
  });

  it("aumenta, no toca costos y se puede deshacer", async () => {
    const before = await prices();
    const pv = await previewPriceIncrease({ percent: "10", rounding: "CENT" });
    if (!pv.success) throw new Error("preview");
    const r = await bulkIncreasePrices({ percent: "10", rounding: "CENT", expectedCount: pv.count });
    expect(r.success).toBe(true);
    const after = await prices();
    const t = after.get(tierId)!;
    expect(t.priceCents).toBe(1100);
    expect(t.wholesalePriceCents).toBe(990);
    for (const [id, row] of after) {
      expect(row.costCents).toBe(before.get(id)!.costCents);
      if (backup.find((b) => b.id === id)!.isActive) expect(row.priceCents).toBeGreaterThanOrEqual(before.get(id)!.priceCents);
    }
    const last = await getLastPriceAdjustment();
    expect(last).toMatchObject({ percentBp: 1000, productCount: pv.count, canUndo: true });
    expect(last?.actorName).toBe("Gerente Pruebas");

    const u = await undoLastPriceAdjustment();
    expect(u.success).toBe(true);
    expect(await prices()).toEqual(before);
    const again = await undoLastPriceAdjustment();
    expect(again.success).toBe(false);
  });

  it("no revierte productos editados después del ajuste", async () => {
    const r = await bulkIncreasePrices({ percent: "5", rounding: "0.05" });
    expect(r.success).toBe(true);
    await owner.product.update({ where: { id: tierId }, data: { priceCents: 4321 } });
    const u = await undoLastPriceAdjustment();
    expect(u.success).toBe(true);
    if (u.success) expect(u.skipped).toBe(1);
    expect((await prices()).get(tierId)!.priceCents).toBe(4321);
  });

  it("no deja deshacer pasadas 24 horas", async () => {
    await owner.product.update({ where: { id: tierId }, data: { priceCents: 1000 } });
    const r = await bulkIncreasePrices({ percent: "5", rounding: "CENT" });
    expect(r.success).toBe(true);
    await owner.priceAdjustment.updateMany({ where: { companyId: ctx.companyId, undoneAt: null }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    const u = await undoLastPriceAdjustment();
    expect(u.success).toBe(false);
  });

  it("un vendedor no puede aumentar, previsualizar ni deshacer", async () => {
    asSeller = true;
    try {
      await expect(bulkIncreasePrices({ percent: "10", rounding: "CENT" })).rejects.toThrow();
      await expect(previewPriceIncrease({ percent: "10", rounding: "CENT" })).rejects.toThrow();
      await expect(undoLastPriceAdjustment()).rejects.toThrow();
    } finally {
      asSeller = false;
    }
  });
});
