"use server";

import { Prisma } from "@prisma/client";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { closedDayWindows } from "@/lib/closed-days";
import {
  selectionToWindows,
  SHOP_TIME_ZONE,
  type BottomProductPoint,
  type DateRangeSelection,
  type SalesByDayPoint,
  type TopProductPoint,
} from "@/lib/report-types";

// Builds a `(col >= a AND col < b) OR (col >= c AND col < d) OR ...` raw-SQL
// fragment for one or more disjoint windows — the raw-query equivalent of
// `OR: windows.map(w => ({ [field]: { gte: w.start, lt: w.end } }))` used by
// the plain Prisma queries below. `column` is always a hardcoded string from
// this file, never user input.
function windowsSql(column: string, windows: { start: Date; end: Date }[]): Prisma.Sql {
  const parts = windows.map((w) => Prisma.sql`(${Prisma.raw(column)} >= ${w.start} AND ${Prisma.raw(column)} < ${w.end})`);
  return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
}

async function getCurrentRate(tx: Prisma.TransactionClient, companyId: string): Promise<number> {
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: { exchangeRate: true },
  });
  return company?.exchangeRate != null ? Number(company.exchangeRate) : 0;
}

export async function revenueTotals(range: DateRangeSelection) {
  const { companyId, branchId } = await requireManager();
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) {
      return { totalEurCents: 0, totalVES: 0, count: 0, avgEurCents: 0 };
    }

    const currentRate = await getCurrentRate(tx, companyId);

    const result = await tx.sale.aggregate({
      _sum: { totalCents: true },
      _count: true,
      where: {
        companyId,
        ...(branchId ? { branchId } : {}),
        OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
        voided: false,
      },
    });
    const totalEurCents = result._sum.totalCents ?? 0;
    const count = result._count;

    // Sums each sale's own historical rate — except a credit sale that has
    // since been collected, which uses the rate in effect on the day it was
    // actually paid (paidExchangeRate), so this total stays reconciled with
    // what was actually collected instead of the stale rate at sale time.
    // Falls back to the company's current rate for pre-feature sales with no
    // snapshot at all.
    const [vesRow] = await tx.$queryRaw<{ ves_total: number | null }[]>`
      SELECT COALESCE(SUM("totalCents"::numeric * COALESCE("paidExchangeRate", "exchangeRate", ${currentRate}) / 100), 0) AS ves_total
      FROM "Sale"
      WHERE "companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('"createdAt"', windows)} AND "voided" = false
    `;

    return {
      totalEurCents,
      totalVES: Number(vesRow?.ves_total ?? 0),
      count,
      avgEurCents: count > 0 ? Math.round(totalEurCents / count) : 0,
    };
  });
}

export async function receivablesTotals() {
  const { companyId, branchId } = await requireManager();

  return withTenant(companyId, async (tx) => {
    const currentRate = await getCurrentRate(tx, companyId);

    const result = await tx.sale.aggregate({
      _sum: { totalCents: true },
      _count: true,
      where: { companyId, ...(branchId ? { branchId } : {}), voided: false, paymentStatus: "CREDIT" },
    });
    const totalEurCents = result._sum.totalCents ?? 0;
    const count = result._count;

    // Unlike settled sales, an outstanding credit balance isn't worth a fixed
    // amount of bolívares until it's collected — always value it at today's
    // rate rather than the (possibly stale) rate from whenever it was sold.
    const [vesRow] = await tx.$queryRaw<{ ves_total: number | null }[]>`
      SELECT COALESCE(SUM("totalCents"::numeric * ${currentRate} / 100), 0) AS ves_total
      FROM "Sale"
      WHERE "companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        AND "voided" = false AND "paymentStatus" = 'CREDIT'
    `;

    return {
      totalEurCents,
      totalVES: Number(vesRow?.ves_total ?? 0),
      count,
    };
  });
}

export async function salesByDay(range: DateRangeSelection): Promise<SalesByDayPoint[]> {
  const { companyId, branchId } = await requireManager();
  const requestedWindows = selectionToWindows(range);

  const rows = await withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];

    const currentRate = await getCurrentRate(tx, companyId);

    // "createdAt" is stored as a naive UTC timestamp; convert to the shop's local
    // timezone before truncating so a day bucket matches the shop's actual business day.
    return tx.$queryRaw<
      { day: Date; totalEurCents: bigint; totalVES: number; count: bigint }[]
    >`
      SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE})::date AS day,
             SUM("totalCents")::bigint AS "totalEurCents",
             COALESCE(SUM("totalCents"::numeric * COALESCE("paidExchangeRate", "exchangeRate", ${currentRate}) / 100), 0) AS "totalVES",
             COUNT(*)::bigint AS count
      FROM "Sale"
      WHERE "companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('"createdAt"', windows)} AND "voided" = false
      GROUP BY day
      ORDER BY day ASC
    `;
  });

  return rows.map((r) => ({
    // `date` columns come back as a UTC-midnight JS Date; read the Y-M-D with
    // UTC getters to avoid re-shifting the day in the server/client's own timezone.
    day: `${r.day.getUTCFullYear()}-${String(r.day.getUTCMonth() + 1).padStart(2, "0")}-${String(
      r.day.getUTCDate()
    ).padStart(2, "0")}`,
    totalEurCents: Number(r.totalEurCents),
    totalVES: Number(r.totalVES),
    count: Number(r.count),
  }));
}

export type CurrencyIncomeRow = { currencyCode: string; totalCents: number };

// Actual income received, broken down by the currency each payment line was
// collected in (USD via Zelle/Binance/PayPal/foreign cash, the company's own
// local currency for everything else, or "EUR" for split-payment rows
// recorded before per-line currency tracking existed). Scoped to when the
// money was actually collected (SalePayment.createdAt) rather than the
// sale's own date, so a credit sale collected later counts as income on the
// day it was actually paid, not the day it was sold.
export async function incomeByCurrency(range: DateRangeSelection): Promise<CurrencyIncomeRow[]> {
  const { companyId, branchId } = await requireManager();
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];

    const rows = await tx.$queryRaw<{ currency: string; total_cents: bigint }[]>`
      SELECT COALESCE(
               sp."currencyCode",
               CASE WHEN sp."paymentMethod"::text IN ('ZELLE', 'BINANCE', 'PAYPAL') THEN 'USD' ELSE 'EUR' END
             ) AS currency,
             SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS total_cents
      FROM "SalePayment" sp
      JOIN "Sale" s ON s.id = sp."saleId"
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('sp."createdAt"', windows)}
        AND s."voided" = false
      GROUP BY currency
      ORDER BY total_cents DESC
    `;
    return rows.map((r) => ({ currencyCode: r.currency, totalCents: Number(r.total_cents) }));
  });
}

export async function topProducts(range: DateRangeSelection, limit = 10): Promise<TopProductPoint[]> {
  const { companyId, branchId } = await requireManager();
  const requestedWindows = selectionToWindows(range);
  const grouped = await withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];
    return tx.saleItem.groupBy({
      by: ["productId", "productName", "category"],
      where: {
        sale: {
          companyId,
          ...(branchId ? { branchId } : {}),
          OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
          voided: false,
        },
      },
      _sum: { quantity: true, subtotalCents: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });
  });
  return grouped.map((g) => ({
    productId: g.productId,
    productName: g.productName,
    category: g.category,
    quantity: g._sum.quantity ?? 0,
    revenueCents: g._sum.subtotalCents ?? 0,
  }));
}

// Every active product, ranked by units sold ascending (0 first) — a LEFT
// JOIN from Product rather than grouping SaleItem, so a product that hasn't
// sold at all in the range still shows up as "0 vendidos" instead of being
// invisible. That's the useful signal here: dead stock, not just the
// bottom of what happened to sell.
export async function bottomProducts(range: DateRangeSelection, limit = 10): Promise<BottomProductPoint[]> {
  const { companyId, branchId } = await requireManager();
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    // No closed day at all in range — every active product still shows up
    // (that's the point, see doc-comment above), just with quantity 0 for
    // all of them, same as if none had sold.
    const saleMatch = windows.length === 0 ? Prisma.sql`FALSE` : windowsSql('"createdAt"', windows);

    return tx.$queryRaw<{ id: string; name: string; category: string | null; quantity: bigint }[]>`
      SELECT p.id, p.name, p.category,
             COALESCE(SUM(si.quantity), 0)::bigint AS quantity
      FROM "Product" p
      LEFT JOIN "SaleItem" si ON si."productId" = p.id
        AND si."saleId" IN (
          SELECT id FROM "Sale"
          WHERE "companyId" = ${companyId}
            ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
            AND ${saleMatch} AND "voided" = false
        )
      WHERE p."companyId" = ${companyId} AND p."isActive" = true
        ${branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY p.id, p.name, p.category
      ORDER BY quantity ASC, p.name ASC
      LIMIT ${limit}
    `;
  }).then((rows) =>
    rows.map((r) => ({ productId: r.id, productName: r.name, category: r.category, quantity: Number(r.quantity) }))
  );
}
