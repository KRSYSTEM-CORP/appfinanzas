import { beforeAll, describe, expect, it, vi } from "vitest";
import { todayDateString } from "@/lib/report-types";
import { closingDateFromString } from "@/lib/closed-days";
import { randomUUID } from "node:crypto";
import { customer, loadContext, owner, sessionFor, type Ctx } from "./helpers";

// Server-only modules the actions import: a fixed manager session for the
// seeded company, and no-op cache/realtime side effects.
let ctx: Ctx;
vi.mock("@/lib/session", () => ({
  requireManagerOrPermission: async () => sessionFor(ctx),
  requireAccountingManagerOrPermission: async () => sessionFor(ctx),
  requireAdminAccess: async () => sessionFor(ctx),
  requireAccountingPlan: async () => sessionFor(ctx),
  hasPermission: () => true,
  requireSession: async () => sessionFor(ctx),
  requireManager: async () => sessionFor(ctx),
  requireSectionAccess: async () => sessionFor(ctx),
  getSession: async () => sessionFor(ctx),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/realtime", () => ({ notifyLive: async () => {}, posChannel: (id: string) => id }));

const { completeSale, voidSale, issueCreditNote, registerPayment, getOrCreateInvoiceNumber } = await import("@/lib/actions/sales");

async function stockOf(productId: string) {
  return Number((await owner.product.findUniqueOrThrow({ where: { id: productId } })).stock);
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
  // Regla: no se vende con la caja cerrada. Se abre una para las ventas de la prueba.
  const today = closingDateFromString(todayDateString());
  await owner.cashOpening.upsert({
    where: { branchId_date_shiftNumber: { branchId: ctx.branchId, date: today, shiftNumber: 1 } },
    update: {},
    create: { companyId: ctx.companyId, branchId: ctx.branchId, date: today, amountCents: 0, setById: ctx.userId ?? "test", shiftNumber: 1 },
  });
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

  it("con «exigir cliente» activo, rechaza «Cliente general» y acepta un cliente real", async () => {
    await owner.company.update({ where: { id: ctx.companyId }, data: { requireCustomerOnSale: true } });
    try {
      const product = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
      const company = await owner.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
      const totalRef = product.priceCents / 100;
      const payments =
        company.referenceCurrency === "USD"
          ? [{ paymentMethod: "ZELLE", amount: totalRef, reference: "INT-REQ" }]
          : [{ paymentMethod: "CASH", amount: Math.round(totalRef * Number(company.exchangeRate) * 100) / 100 }];
      const general = await completeSale({ ...customer, customerPhone: "0000-0000000", items: [{ productId: ctx.productId, quantity: 1 }], payments });
      expect(general.success).toBe(false);
      const real = await completeSale({ ...customer, items: [{ productId: ctx.productId, quantity: 1 }], payments });
      expect(real.success).toBe(true);
    } finally {
      await owner.company.update({ where: { id: ctx.companyId }, data: { requireCustomerOnSale: false } });
    }
  });

  it("rechaza vender más que el stock disponible", async () => {
    const stock = await stockOf(ctx.productId);
    await expect(sell(stock + 1)).rejects.toThrow(/Stock insuficiente/);
  });
});

describe("notas de crédito (Próximamente)", () => {
  it("el servidor las rechaza y la venta sigue intacta", async () => {
    const sale = await sell(1);
    await getOrCreateInvoiceNumber(sale.id);
    const result = await issueCreditNote(sale.id, "Devolución de prueba");
    expect(result.success).toBe(false);
    const after = await owner.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(after.voided).toBe(false);
  });
});

describe("anular con efectivo cobrado", () => {
  it("registra una devolución en Caja Chica atada a la venta, sin duplicarse", async () => {
    const sale = await sell(1);
    await owner.salePayment.deleteMany({ where: { saleId: sale.id } });
    await owner.salePayment.create({ data: { saleId: sale.id, paymentMethod: "CASH", amountEurCents: 700 } });
    const before = await stockOf(ctx.productId);
    expect((await voidSale(sale.id)).success).toBe(true);
    expect(await stockOf(ctx.productId)).toBe(before + 1);
    const rows = await owner.cashOutflow.findMany({ where: { saleId: sale.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].amountCents).toBe(700);
    expect(rows[0].concept).toMatch(/^Devolución por anulación de venta N\.º /);
    // Reintentar no duplica ni crea otra salida.
    expect((await voidSale(sale.id)).success).toBe(false);
    expect(await owner.cashOutflow.count({ where: { saleId: sale.id } })).toBe(1);
  });

  it("un cobro que no es efectivo también se devuelve (sin cuenta, no resta de la caja)", async () => {
    const sale = await sell(1);
    await owner.salePayment.deleteMany({ where: { saleId: sale.id } });
    await owner.salePayment.create({ data: { saleId: sale.id, paymentMethod: "ZELLE", amountEurCents: 700 } });
    expect((await voidSale(sale.id)).success).toBe(true);
    const rows = await owner.cashOutflow.findMany({ where: { saleId: sale.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ paymentMethod: "ZELLE", amountCents: 700, paymentAccountId: null });
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
