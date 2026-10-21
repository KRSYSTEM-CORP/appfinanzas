import { beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { customer, loadContext, owner, sessionFor, type Ctx } from "./helpers";

// Server-only modules the actions import: a fixed manager session for the
// seeded company, and no-op cache/realtime side effects.
let ctx: Ctx;
vi.mock("@/lib/session", () => ({
  requireSession: async () => sessionFor(ctx),
  requireManager: async () => sessionFor(ctx),
  requireSectionAccess: async () => sessionFor(ctx),
  getSession: async () => sessionFor(ctx),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/realtime", () => ({ notifyLive: async () => {}, posChannel: (id: string) => id }));

const { completeSale, issueCreditNote, registerPayment, getOrCreateInvoiceNumber } = await import("@/lib/actions/sales");

async function stockOf(productId: string) {
  return (await owner.product.findUniqueOrThrow({ where: { id: productId } })).stock;
}

async function sell(quantity: number, extra: Record<string, unknown> = {}) {
  const product = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
  const company = await owner.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
  const totalRef = (product.priceCents * quantity) / 100;
  // Pay in the reference currency (Zelle = USD) when that's the reference;
  // otherwise in local currency at the company's rate.
  const payments =
    company.referenceCurrency === "USD"
      ? [{ paymentMethod: "ZELLE", amount: totalRef, reference: "INT-TEST" }]
      : [{ paymentMethod: "CASH", amount: Math.round(totalRef * Number(company.exchangeRate) * 100) / 100 }];
  const result = await completeSale({ ...customer, items: [{ productId: ctx.productId, quantity }], payments, ...extra });
  if (!result.success) throw new Error(result.error);
  return owner.sale.findUniqueOrThrow({ where: { id: result.saleId }, include: { items: true } });
}

beforeAll(async () => {
  ctx = await loadContext();
});

describe("completeSale", () => {
  it("guarda la venta, descuenta el stock y desglosa el IVA", async () => {
    const before = await stockOf(ctx.productId);
    const sale = await sell(2);
    expect(await stockOf(ctx.productId)).toBe(before - 2);
    expect(sale.items).toHaveLength(1);
    expect(sale.baseImponibleCents + sale.taxCents).toBe(sale.totalCents);
    expect(sale.paymentStatus).toBe("PAID");
  });

  it("asigna el número siguiente al mayor, aunque se haya borrado una venta intermedia", async () => {
    const a = await sell(1);
    await sell(1);
    // Simulate a historic physical delete of an intermediate sale.
    await owner.salePayment.deleteMany({ where: { saleId: a.id } });
    await owner.saleItem.deleteMany({ where: { saleId: a.id } });
    await owner.stockMovement.deleteMany({ where: { sourceId: a.id } });
    await owner.sale.delete({ where: { id: a.id } });
    const max = (await owner.sale.aggregate({ where: { branchId: ctx.branchId }, _max: { controlNumber: true } }))._max.controlNumber!;
    const next = await sell(1);
    expect(next.controlNumber).toBe(max + 1);
  });

  it("la misma venta enviada dos veces (reintento sin conexión) se guarda una sola vez", async () => {
    const key = randomUUID();
    const first = await sell(1, { idempotencyKey: key });
    const second = await sell(1, { idempotencyKey: key });
    expect(second.id).toBe(first.id);
    expect(await owner.sale.count({ where: { companyId: ctx.companyId, idempotencyKey: key } })).toBe(1);
  });

  it("rechaza vender más que el stock disponible", async () => {
    const stock = await stockOf(ctx.productId);
    await expect(sell(stock + 1)).rejects.toThrow(/Stock insuficiente/);
  });
});

describe("notas de crédito", () => {
  it("anulan la venta facturada y reponen el stock", async () => {
    const sale = await sell(3);
    await getOrCreateInvoiceNumber(sale.id);
    const before = await stockOf(ctx.productId);
    const result = await issueCreditNote(sale.id, "Devolución de prueba");
    expect(result.success).toBe(true);
    expect(await stockOf(ctx.productId)).toBe(before + 3);
    const updated = await owner.sale.findUniqueOrThrow({ where: { id: sale.id }, include: { creditNote: true } });
    expect(updated.voided).toBe(true);
    expect(updated.creditNote?.totalCents).toBe(sale.totalCents);
  });

  it("no se emiten sobre una venta sin factura", async () => {
    const sale = await sell(1);
    const result = await issueCreditNote(sale.id, "Sin factura");
    expect(result.success).toBe(false);
  });
});

describe("abonos a crédito", () => {
  it("varios abonos llevan la venta a pagada y le asignan recibo", async () => {
    const product = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
    const company = await owner.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
    const result = await completeSale({ ...customer, items: [{ productId: ctx.productId, quantity: 2 }], paymentStatus: "CREDIT" });
    if (!result.success) throw new Error(result.error);
    const total = product.priceCents * 2;
    const half = Math.floor(total / 2);
    const pay = (cents: number) =>
      company.referenceCurrency === "USD"
        ? [{ paymentMethod: "ZELLE", amount: cents / 100, reference: "ABONO" }]
        : [{ paymentMethod: "CASH", amount: Math.round((cents / 100) * Number(company.exchangeRate) * 100) / 100 }];

    expect((await registerPayment(result.saleId, { payments: pay(half) })).success).toBe(true);
    let sale = await owner.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(sale.paymentStatus).toBe("CREDIT");

    expect((await registerPayment(result.saleId, { payments: pay(total - half) })).success).toBe(true);
    sale = await owner.sale.findUniqueOrThrow({ where: { id: result.saleId } });
    expect(sale.paymentStatus).toBe("PAID");
    expect(sale.receiptControlNumber).not.toBeNull();
  });
});
