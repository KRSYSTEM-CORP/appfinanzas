import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadContext, owner, sessionFor, type Ctx } from "./helpers";

// Las pantallas de Finanzas, Estados financieros, Cuentas, Ajustes e Inicio leen decenas de agregados.
// Ahora comparten una transacción (withTenantScope) y las lecturas SQL independientes viajan agrupadas
// (lib/batch-sql.ts). Estas pruebas exigen que las cifras sean IDÉNTICAS: (1) con y sin el scope compartido
// (KR_NO_TENANT_SCOPE=1) y (2) contra el cálculo original con el ORM de Prisma sobre la conexión del dueño.
let ctx: Ctx;
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => {
  const s = () => ({ ...sessionFor(ctx), plan: "CORPORATIVO", permissions: null, roleName: null, pinnedBranchId: null, locked: false, hasPin: false, inTrial: false, needsPlanChoice: false, lockMinutes: null });
  return {
    requireManagerOrPermission: async () => s(),
    requireAccountingManagerOrPermission: async () => s(),
    requireAdminAccess: async () => s(),
    requireSectionAccess: async () => s(),
    requireAccountingPlan: async () => s(),
    requirePermission: async () => s(),
    hasPermission: () => true,
    getSession: async () => s(),
    requireSession: async () => s(),
    requireManager: async () => s(),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`); } }));
vi.mock("@/lib/cache", () => ({ getOrSetCache: async (_k: string, _t: number, f: () => unknown) => f(), invalidateCache: async () => {} }));

const reports = await import("@/lib/actions/reports");
const finance = await import("@/lib/actions/finance");
const sellers = await import("@/lib/actions/seller-reports");
const home = await import("@/lib/actions/home");
const statements = await import("@/lib/actions/statements");
const accounts = await import("@/lib/actions/payment-accounts");
const period = await import("@/lib/actions/accounts-period");
const cash = await import("@/lib/actions/cash-closing");
const branches = await import("@/lib/actions/branches");
const transfers = await import("@/lib/actions/transfers");
const settings = await import("@/lib/actions/settings");
const { withTenantScope } = await import("@/lib/tenant-db");
const { closedDayWindows } = await import("@/lib/closed-days");
const { withTenant } = await import("@/lib/tenant-db");
const { selectionToWindows } = await import("@/lib/report-types");

const YEAR = { kind: "months" as const, year: new Date().getFullYear(), months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
const MONTH = { kind: "preset" as const, preset: "month" as const };
const SEVEN = { kind: "preset" as const, preset: "7d" as const };

const json = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x));

// Las lecturas de las cinco pantallas, para un periodo.
function screenReads(range: typeof YEAR | typeof MONTH | typeof SEVEN) {
  return {
    revenueTotals: () => reports.revenueTotals(range),
    revenueComparison: () => reports.revenueComparison(range),
    receivablesTotals: () => reports.receivablesTotals(),
    salesByDay: () => reports.salesByDay(range),
    topProducts: () => reports.topProducts(range),
    bottomProducts: () => reports.bottomProducts(range),
    incomeByCurrency: () => reports.incomeByCurrency(range),
    salesByPaymentMethod: () => reports.salesByPaymentMethod(range),
    mostPurchasedProducts: () => reports.mostPurchasedProducts(range),
    inventoryRotation: () => reports.inventoryRotation(range),
    customerMix: () => reports.customerMix(range),
    restockSuggestions: () => reports.restockSuggestions(),
    periodExtras: () => reports.periodExtras(range),
    weeklyReports: () => reports.weeklyReports(),
    getWeeklyReportEnabled: () => reports.getWeeklyReportEnabled(),
    ticketDistribution: () => reports.ticketDistribution(range),
    costOfGoodsSold: () => finance.costOfGoodsSold(range),
    netSalesCents: () => finance.netSalesCents(range),
    netSalesWithoutCost: () => finance.netSalesWithoutCost(range),
    expensesTotal: () => finance.expensesTotal(range),
    listExpenses: () => finance.listExpenses(range),
    listExpensesSearch: () => finance.listExpenses(range, "a"),
    categoryMargins: () => finance.categoryMargins(range),
    productMargins: () => finance.productMargins(range),
    getProfitGoal: () => finance.getProfitGoal(),
    commissionsTotal: () => sellers.commissionsTotal(range),
    sellersSalesOverview: () => sellers.sellersSalesOverview(range),
    salesHeatmap: () => home.salesHeatmap(),
    salesByHourToday: () => home.salesByHourToday(),
    latestSales: () => home.latestSales(5),
    getStatements: () => statements.getStatements(range, 15),
    listMovements: () => statements.listMovements(range),
    getAccountBalances: () => accounts.getAccountBalances(),
    listPaymentAccounts: () => accounts.listPaymentAccounts(true),
    listSourceAccounts: () => accounts.listSourceAccounts(true),
    getAccountsPeriodReport: () => period.getAccountsPeriodReport({ seg: "fecha", selection: range }),
    getAccountsPeriodMovements: () => period.getAccountsPeriodMovements({ seg: "fecha", selection: range }, null),
    getDailyClosingSummary: () => cash.getDailyClosingSummary(new Date().toISOString().slice(0, 10)),
    listPendingClosings: () => cash.listPendingClosings(range),
    listRecentClosings: () => cash.listRecentClosings(10),
    branchOverview: () => branches.branchOverview(),
    listTransfers: () => transfers.listTransfers(5),
    listTransferSuggestions: () => transfers.listTransferSuggestions(),
    getExchangeRateInfo: () => settings.getExchangeRateInfo(),
    getIvaSettings: () => settings.getIvaSettings(),
    getFiscalData: () => settings.getFiscalData(),
  };
}

async function runAll(range: typeof YEAR | typeof MONTH | typeof SEVEN, mode: "scope" | "sinScope" | "secuencial") {
  const reads = screenReads(range);
  const names = Object.keys(reads) as (keyof typeof reads)[];
  const out: Record<string, string> = {};
  const exec = async (n: (typeof names)[number]) => {
    out[n] = json(await reads[n]());
  };
  if (mode === "scope") {
    await withTenantScope(ctx.companyId, () => Promise.all(names.map(exec)));
  } else if (mode === "sinScope") {
    process.env.KR_NO_TENANT_SCOPE = "1";
    try {
      await Promise.all(names.map(exec));
    } finally {
      delete process.env.KR_NO_TENANT_SCOPE;
    }
  } else {
    for (const n of names) await exec(n);
  }
  return out;
}

beforeAll(async () => {
  ctx = await loadContext();
});
afterAll(async () => {
  delete process.env.KR_NO_TENANT_SCOPE;
});

describe("misma cifra con y sin transacción compartida", () => {
  for (const [name, range] of [["año", YEAR], ["mes", MONTH], ["7 días", SEVEN]] as const) {
    it(`todas las lecturas de las pantallas coinciden (${name})`, async () => {
      // Calentamiento: la primera lectura puede refrescar la tasa BCV vencida (escribe la empresa); sin esto las siguientes ven otra tasa.
      await runAll(range, "sinScope");
      const [scoped, plain, serial] = [await runAll(range, "scope"), await runAll(range, "sinScope"), await runAll(range, "secuencial")];
      for (const k of Object.keys(plain)) {
        expect(scoped[k], `scope vs sin scope: ${k}`).toBe(plain[k]);
        expect(serial[k], `secuencial vs sin scope: ${k}`).toBe(plain[k]);
      }
    });
  }
});

// Cálculo original (ORM de Prisma, conexión del dueño sin RLS) de las cifras que ahora salen de SQL agrupado.
describe("las cifras agrupadas igualan el cálculo original con el ORM", () => {
  const companyWhere = () => ({ companyId: ctx.companyId, branchId: ctx.branchId });

  async function closedWindows(range: typeof YEAR) {
    return withTenant(ctx.companyId, (tx) => closedDayWindows(tx, ctx.companyId, ctx.branchId, selectionToWindows(range)));
  }

  it("ventas, venta promedio y ventas por vendedor", async () => {
    const w = await closedWindows(YEAR);
    const where = { ...companyWhere(), voided: false, OR: w.map((x) => ({ createdAt: { gte: x.start, lt: x.end } })) };
    const agg = w.length ? await owner.sale.aggregate({ where, _sum: { totalCents: true }, _count: true }) : { _sum: { totalCents: 0 }, _count: 0 };
    const t = await reports.revenueTotals(YEAR);
    expect(t.totalEurCents).toBe(agg._sum.totalCents ?? 0);
    expect(t.count).toBe(agg._count);
    expect(t.avgEurCents).toBe(agg._count > 0 ? Math.round((agg._sum.totalCents ?? 0) / agg._count) : 0);

    if (w.length) {
      const grouped = await owner.sale.groupBy({ by: ["sellerId"], where: { ...where, sellerId: { not: null } }, _sum: { totalCents: true }, _count: true });
      const overview = await sellers.sellersSalesOverview(YEAR, { closedOnly: true });
      for (const g of grouped) {
        const row = overview.find((r) => r.userId === g.sellerId);
        expect(row?.totalEurCents).toBe(g._sum.totalCents ?? 0);
        expect(row?.count).toBe(g._count);
      }
    }
  });

  it("por cobrar: ventas a crédito menos lo abonado", async () => {
    const where = { ...companyWhere(), voided: false, paymentStatus: "CREDIT" as const };
    const [sales, paid] = await Promise.all([
      owner.sale.aggregate({ where, _sum: { totalCents: true }, _count: true }),
      owner.salePayment.aggregate({ where: { sale: where }, _sum: { amountEurCents: true } }),
    ]);
    const r = await reports.receivablesTotals();
    expect(r.totalEurCents).toBe(Math.max(0, (sales._sum.totalCents ?? 0) - (paid._sum.amountEurCents ?? 0)));
    expect(r.count).toBe(sales._count);
  });

  it("gastos: total y listado", async () => {
    const wins = selectionToWindows(YEAR);
    const where = { ...companyWhere(), OR: wins.map((x) => ({ spentAt: { gte: x.start, lt: x.end } })) };
    const [agg, rows] = await Promise.all([owner.expense.aggregate({ where, _sum: { amountCents: true } }), owner.expense.findMany({ where, orderBy: { spentAt: "desc" } })]);
    expect(await finance.expensesTotal(YEAR)).toBe(agg._sum.amountCents ?? 0);
    const listed = await finance.listExpenses(YEAR);
    expect(listed.map((e) => e.id).sort()).toEqual(rows.map((e) => e.id).sort());
    for (const e of listed) {
      const o = rows.find((r) => r.id === e.id)!;
      expect(e.amountCents).toBe(o.amountCents);
      expect(e.spentAt.getTime()).toBe(o.spentAt.getTime());
      expect(e.createdAt.getTime()).toBe(o.createdAt.getTime());
      expect(Number(e.exchangeRate ?? 0)).toBe(Number(o.exchangeRate ?? 0));
    }
  });

  it("los más vendidos igualan el groupBy de partidas", async () => {
    const w = await closedWindows(YEAR);
    if (w.length === 0) return;
    const grouped = await owner.saleItem.groupBy({
      by: ["productId", "productName", "category"],
      where: { sale: { ...companyWhere(), voided: false, OR: w.map((x) => ({ createdAt: { gte: x.start, lt: x.end } })) } },
      _sum: { quantity: true, subtotalCents: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10,
    });
    const top = await reports.topProducts(YEAR);
    // Mismas cantidades por posición (los empates pueden venir en otro orden entre dos consultas).
    expect(top.map((t) => t.quantity)).toEqual(grouped.map((g) => g._sum.quantity ?? 0));
    for (const t of top) {
      const g = grouped.find((x) => x.productId === t.productId && x.productName === t.productName);
      if (g) expect(t.revenueCents).toBe(g._sum.subtotalCents ?? 0);
    }
  });

  it("semanas del reporte semanal", async () => {
    const weekly = await reports.weeklyReports();
    expect(weekly).toHaveLength(4);
    for (const wk of weekly) {
      const start = new Date(`${wk.from}T00:00:00-04:00`);
      const end = new Date(`${wk.to}T00:00:00-04:00`);
      end.setUTCDate(end.getUTCDate() + 1);
      const agg = await owner.sale.aggregate({ where: { ...companyWhere(), voided: false, createdAt: { gte: start, lt: end } }, _sum: { totalCents: true }, _count: true });
      expect(wk.cents).toBe(agg._sum.totalCents ?? 0);
      expect(wk.count).toBe(agg._count);
    }
  });

  it("estados financieros: inventario, por pagar y consumo interno", async () => {
    const s = await statements.getStatements(YEAR, 15);
    const products = await owner.product.findMany({ where: { ...companyWhere(), trackStock: true }, select: { stock: true, costCents: true } });
    expect(s.inventory).toBe(products.reduce((n, p) => n + Math.round(Math.max(Number(p.stock), 0) * (p.costCents ?? 0)), 0));
    const pending = await owner.purchase.aggregate({ where: { ...companyWhere(), voided: false, paymentStatus: "PENDING" }, _sum: { totalCents: true } });
    expect(s.payables).toBe(pending._sum.totalCents ?? 0);
    const wins = selectionToWindows(YEAR);
    const moves = await owner.stockMovement.findMany({
      where: { companyId: ctx.companyId, branchId: ctx.branchId, reason: "INTERNAL_USE", OR: wins.map((x) => ({ createdAt: { gte: x.start, lt: x.end } })) },
      select: { productId: true, quantityChange: true },
    });
    const costs = await owner.product.findMany({ where: { companyId: ctx.companyId, id: { in: moves.map((m) => m.productId).filter((x): x is string => !!x) } }, select: { id: true, costCents: true } });
    const cost = new Map(costs.map((p) => [p.id, p.costCents ?? 0]));
    expect(s.internalUse).toBe(moves.reduce((n, m) => n + (m.productId ? (cost.get(m.productId) ?? 0) : 0) * Math.abs(Number(m.quantityChange)), 0));
  });

  it("IVA del libro: base e IVA netos igualan facturas + débito − crédito", async () => {
    const wins = selectionToWindows(YEAR);
    const orWin = wins.map((x) => ({ createdAt: { gte: x.start, lt: x.end } }));
    const [sales, cn, dn, purchases] = await Promise.all([
      owner.sale.findMany({ where: { ...companyWhere(), OR: undefined, AND: [{ OR: orWin }, { OR: [{ voided: false }, { creditNote: { isNot: null } }] }] }, select: { baseImponibleCents: true, taxCents: true } }),
      owner.creditNote.findMany({ where: { ...companyWhere(), OR: orWin }, select: { baseImponibleCents: true, taxCents: true } }),
      owner.debitNote.findMany({ where: { ...companyWhere(), OR: orWin }, select: { baseImponibleCents: true, taxCents: true } }),
      owner.purchase.findMany({ where: { ...companyWhere(), voided: false, OR: orWin }, select: { baseImponibleCents: true, taxCents: true, totalCents: true } }),
    ]);
    const sum = (rows: { baseImponibleCents: number; taxCents: number }[], f: "baseImponibleCents" | "taxCents") => rows.reduce((n, r) => n + r[f], 0);
    const s = await statements.getStatements(YEAR, 15);
    if (s.ivaEnabled) {
      expect(s.ivaDebit).toBe(sum(sales, "taxCents") + sum(dn, "taxCents") - sum(cn, "taxCents"));
      expect(s.salesBase).toBe(sum(sales, "baseImponibleCents") + sum(dn, "baseImponibleCents") - sum(cn, "baseImponibleCents"));
      expect(s.ivaCredit).toBe(sum(purchases, "taxCents"));
      expect(s.purchasesBase).toBe(sum(purchases, "baseImponibleCents"));
    }
  });

  it("últimas ventas y últimos cierres", async () => {
    const latest = await home.latestSales(5);
    const rows = await owner.sale.findMany({ where: { ...companyWhere(), voided: false }, orderBy: { createdAt: "desc" }, take: 5, include: { payments: true } });
    expect(latest.map((l) => l.id)).toEqual(rows.map((r) => r.id));
    for (const l of latest) {
      const o = rows.find((r) => r.id === l.id)!;
      expect(l.totalCents).toBe(o.totalCents);
      expect(l.paid.map((p) => p.amountEurCents).sort()).toEqual(o.payments.map((p) => p.amountEurCents).sort());
    }
    const closings = await cash.listRecentClosings(10);
    const orig = await owner.cashClosing.findMany({ where: { companyId: ctx.companyId, branchId: ctx.branchId }, orderBy: [{ closingDate: "desc" }, { closedAt: "desc" }], take: 10 });
    expect(closings.map((c) => c.id)).toEqual(orig.map((c) => c.id));
    for (const c of closings) {
      const o = orig.find((x) => x.id === c.id)!;
      expect(c.date).toBe(o.closingDate.toISOString().slice(0, 10));
      expect(c.closedAt.getTime()).toBe(o.closedAt.getTime());
    }
  });
});
