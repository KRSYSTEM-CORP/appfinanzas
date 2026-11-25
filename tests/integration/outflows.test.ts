import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { customer, loadContext, owner, sessionFor, type Ctx } from "./helpers";

let ctx: Ctx;
vi.mock("@/lib/session", () => ({
  requireManagerOrPermission: async () => sessionFor(ctx),
  requireAccountingManagerOrPermission: async () => sessionFor(ctx),
  requireAdminAccess: async () => sessionFor(ctx),
  requireAccountingPlan: async () => sessionFor(ctx),
  hasPermission: () => true,
  requireSession: async () => sessionFor(ctx),
  requireManager: async () => sessionFor(ctx),
  requireCashAccess: async () => sessionFor(ctx),
  requireSectionAccess: async () => sessionFor(ctx),
  getSession: async () => sessionFor(ctx),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/realtime", () => ({ notifyLive: async () => {}, posChannel: (id: string) => id }));

const { completeSale, voidSale } = await import("@/lib/actions/sales");
const { addCashOutflow, deleteCashOutflow, getDailyClosingSummary } = await import("@/lib/actions/cash-closing");
const { getAccountBalances, getAccountMovements } = await import("@/lib/actions/payment-accounts");
const { listOutflowHistory } = await import("@/lib/actions/cash-outflows");

const today = new Date().toISOString().slice(0, 10);
const RATE = 40;
let accountId: string;
let usdAccountId: string;
let rateBackup: { rate: unknown; enabled: boolean; updated: Date | null };

async function balanceOf(id: string) {
  const rows = await getAccountBalances();
  return rows.find((r) => r.id === id)!.balanceCents;
}

beforeAll(async () => {
  ctx = await loadContext();
  const co = await owner.company.findUniqueOrThrow({ where: { id: ctx.companyId } });
  rateBackup = { rate: co.exchangeRate, enabled: co.exchangeRateEnabled, updated: co.exchangeRateUpdatedAt };
  await owner.company.update({ where: { id: ctx.companyId }, data: { exchangeRate: RATE, exchangeRateEnabled: true, exchangeRateUpdatedAt: new Date() } });
  await owner.cashOpening.upsert({
    where: { branchId_date_shiftNumber: { branchId: ctx.branchId, date: new Date(today), shiftNumber: 1 } },
    update: {},
    create: { companyId: ctx.companyId, branchId: ctx.branchId, date: new Date(today), amountCents: 0, setById: ctx.userId, shiftNumber: 1 },
  });
  const mk = (kind: "PAGO_MOVIL" | "ZELLE", currency: string, num: string) =>
    owner.paymentAccount.create({ data: { companyId: ctx.companyId, kind, bankName: `Prueba ${num}`, accountNumber: num, currency, openingCents: 0 } });
  accountId = (await mk("PAGO_MOVIL", "VES", "SAL-VES")).id;
  usdAccountId = (await mk("ZELLE", "USD", "SAL-USD")).id;
  await owner.accountFunding.create({ data: { companyId: ctx.companyId, paymentAccountId: accountId, amountCents: 1_000_000 } });
});

afterAll(async () => {
  await owner.cashOutflow.deleteMany({ where: { OR: [{ paymentAccountId: { in: [accountId, usdAccountId] } }, { requestKey: { startsWith: "out:itest" } }] } });
  await owner.paymentAccount.deleteMany({ where: { id: { in: [accountId, usdAccountId] } } });
  await owner.company.update({
    where: { id: ctx.companyId },
    data: { exchangeRate: rateBackup.rate as never, exchangeRateEnabled: rateBackup.enabled, exchangeRateUpdatedAt: rateBackup.updated },
  });
});

describe("salidas de Caja Chica con cuenta", () => {
  it("una salida por pago móvil baja el saldo de la cuenta en Bs y no toca el efectivo", async () => {
    const before = await balanceOf(accountId);
    const r = await addCashOutflow(today, "Pago a proveedor", { paymentMethod: "CARD", paymentAccountId: accountId, currency: "LOCAL", amountCents: 200_000 }, "itest-1");
    expect(r.success).toBe(true);
    expect(await balanceOf(accountId)).toBe(before - 200_000);
    const row = await owner.cashOutflow.findFirstOrThrow({ where: { paymentAccountId: accountId } });
    expect(row).toMatchObject({ paymentMethod: "CARD", currencyCode: "VES", amountCurrencyCents: 200_000, amountCents: 200_000 / RATE });
    expect(Number(row.exchangeRate)).toBe(RATE);
    const mv = await getAccountMovements(accountId);
    expect(mv.find((m) => m.kind === "SALIDA")?.amountCents).toBe(-200_000);
    const summary = await getDailyClosingSummary(today);
    const mine = summary.outflows.find((o) => o.id === row.id)!;
    expect(mine.accountLabel).toContain("SAL-VES");
    // No sale de la caja: no cuenta en las salidas en efectivo.
    expect(summary.outflowsCents - summary.cashOutflowsCents).toBeGreaterThanOrEqual(row.amountCents);
  });

  it("reintentar con la misma clave no duplica", async () => {
    const before = await balanceOf(accountId);
    await addCashOutflow(today, "Pago a proveedor", { paymentMethod: "CARD", paymentAccountId: accountId, currency: "LOCAL", amountCents: 200_000 }, "itest-1");
    expect(await balanceOf(accountId)).toBe(before);
    expect(await owner.cashOutflow.count({ where: { paymentAccountId: accountId, requestKey: "out:itest-1:0" } })).toBe(1);
  });

  it("fondos insuficientes: avisa con el código y no guarda nada", async () => {
    const bal = await balanceOf(accountId);
    const r = await addCashOutflow(today, "Demasiado", { paymentMethod: "CARD", paymentAccountId: accountId, currency: "LOCAL", amountCents: bal + 50_000 }, "itest-2");
    expect(r).toMatchObject({ success: false, code: "INSUFFICIENT_FUNDS", accountId });
    expect(await owner.cashOutflow.count({ where: { requestKey: "out:itest-2:0" } })).toBe(0);
  });

  it("efectivo en Bs descuenta bolívares de la caja y quitar la salida la devuelve", async () => {
    const s0 = await getDailyClosingSummary(today);
    const r = await addCashOutflow(today, "Cambio en Bs", { paymentMethod: "CASH", currency: "LOCAL", amountCents: 80_000 }, "itest-3");
    expect(r.success).toBe(true);
    const s1 = await getDailyClosingSummary(today);
    expect(s1.cashOutflowsCents - s0.cashOutflowsCents).toBe(2000);
    const row = await owner.cashOutflow.findFirstOrThrow({ where: { requestKey: "out:itest-3:0" } });
    expect(row).toMatchObject({ paymentMethod: "CASH", currencyCode: "VES", amountCurrencyCents: 80_000, paymentAccountId: null });
    expect((await deleteCashOutflow(today, row.id)).success).toBe(true);
  });

  it("una cuenta en divisa descuenta dólares", async () => {
    await owner.accountFunding.create({ data: { companyId: ctx.companyId, paymentAccountId: usdAccountId, amountCents: 5000 } });
    const r = await addCashOutflow(today, "Zelle", { paymentMethod: "ZELLE", paymentAccountId: usdAccountId, currency: "REFERENCE", amountCents: 1500 }, "itest-4");
    expect(r.success).toBe(true);
    expect(await balanceOf(usdAccountId)).toBe(3500);
  });
});

describe("devolución por anulación desde la cuenta", () => {
  it("el cobro por pago móvil se devuelve desde la misma cuenta y el saldo queda como antes del cobro; varias devoluciones por venta", async () => {
    const product = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
    const totalBs = Math.round((product.priceCents / 100) * RATE * 100) / 100;
    const before = await balanceOf(accountId);
    const res = await completeSale({
      ...customer,
      items: [{ productId: ctx.productId, quantity: 1 }],
      payments: [{ paymentMethod: "CARD", amount: totalBs, paymentAccountId: accountId, reference: "REF-INT" }],
    });
    if (!res.success) throw new Error(res.error);
    const afterSale = await balanceOf(accountId);
    expect(afterSale).toBeGreaterThan(before);
    const paid = afterSale - before;

    // Devolución partida: la mitad por la cuenta y el resto en efectivo en Bs.
    const half = Math.floor(paid / 2);
    const v = await voidSale(res.saleId, [
      { paymentMethod: "CARD", paymentAccountId: accountId, currency: "LOCAL", amountCents: half },
      { paymentMethod: "CASH", currency: "LOCAL", amountCents: paid - half },
    ]);
    expect(v.success).toBe(true);
    const rows = await owner.cashOutflow.findMany({ where: { saleId: res.saleId }, orderBy: { requestKey: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.requestKey)).toEqual([`void:${res.saleId}:0`, `void:${res.saleId}:1`]);
    // La venta anulada sigue contando como cobro mientras tenga devolución: el saldo baja solo lo devuelto desde la cuenta.
    expect(await balanceOf(accountId)).toBe(afterSale - half);
    // Reintentar no duplica.
    expect((await voidSale(res.saleId)).success).toBe(false);
    expect(await owner.cashOutflow.count({ where: { saleId: res.saleId } })).toBe(2);
  });

  it("por defecto se devuelve como se cobró; sin fondos la anulación se cancela completa", async () => {
    const product = await owner.product.findUniqueOrThrow({ where: { id: ctx.productId } });
    const totalBs = Math.round((product.priceCents / 100) * RATE * 100) / 100;
    const res = await completeSale({
      ...customer,
      items: [{ productId: ctx.productId, quantity: 1 }],
      payments: [{ paymentMethod: "CARD", amount: totalBs, paymentAccountId: accountId, reference: "REF-INT" }],
    });
    if (!res.success) throw new Error(res.error);
    // Se vacía la cuenta con un retiro para que la devolución no tenga fondos.
    const bal = await balanceOf(accountId);
    await owner.cashOutflow.create({
      data: { companyId: ctx.companyId, branchId: ctx.branchId, date: new Date(today), concept: "vaciar", amountCents: Math.round(bal / RATE), amountCurrencyCents: bal, currencyCode: "VES", paymentMethod: "CARD", paymentAccountId: accountId, createdById: ctx.userId },
    });
    const v = await voidSale(res.saleId);
    expect(v).toMatchObject({ success: false, code: "INSUFFICIENT_FUNDS", accountId });
    expect((await owner.sale.findUniqueOrThrow({ where: { id: res.saleId } })).voided).toBe(false);
    await owner.accountFunding.create({ data: { companyId: ctx.companyId, paymentAccountId: accountId, amountCents: 5_000_000 } });
    expect((await voidSale(res.saleId)).success).toBe(true);
    const out = await owner.cashOutflow.findMany({ where: { saleId: res.saleId } });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ paymentMethod: "CARD", paymentAccountId: accountId, currencyCode: "VES" });
  });
});

describe("historial de salidas y devoluciones", () => {
  it("lista con método, cuenta, monto en su moneda, autor y venta; filtra por método y cuenta", async () => {
    const range = { kind: "preset", preset: "today" } as const;
    const all = await listOutflowHistory(range);
    expect(all.length).toBeGreaterThan(0);
    const refund = all.find((r) => r.saleId && r.paymentMethod)!;
    expect(refund).toMatchObject({ paymentMethod: expect.any(String), createdByName: expect.any(String) });
    expect(refund.saleNumber).not.toBeUndefined();
    const byAccount = await listOutflowHistory(range, { accountId });
    expect(byAccount.length).toBeGreaterThan(0);
    expect(byAccount.every((r) => r.accountId === accountId)).toBe(true);
    const cash = await listOutflowHistory(range, { method: "CASH" });
    expect(cash.every((r) => r.paymentMethod === "CASH" || r.paymentMethod === null)).toBe(true);
    const zelle = await listOutflowHistory(range, { method: "ZELLE" });
    expect(zelle.every((r) => r.paymentMethod === "ZELLE")).toBe(true);
  });
});
