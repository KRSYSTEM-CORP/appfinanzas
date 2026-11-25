"use server";

import { Prisma } from "@prisma/client";
import { requireManager, requireManagerOrPermission } from "@/lib/session";
import { RESTOCK_WINDOW_DAYS, restockPlan } from "@/lib/restock";
import { bq } from "@/lib/batch-sql";
import { scopeMemo, withTenant } from "@/lib/tenant-db";
import { closedDayWindows } from "@/lib/closed-days";
import {
  comparisonWindows,
  dayBoundsUtc,
  selectionToWindows,
  SHOP_TIME_ZONE,
  todayDateString,
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

// Tasa actual de la empresa (0 si no hay). Una lectura por pantalla y viaja agrupada con las demás.
function getCurrentRate(tx: Prisma.TransactionClient, companyId: string): Promise<number> {
  return scopeMemo(`crate:${companyId}`, async () => {
    const [row] = await bq<{ rate: number | null }>(tx)`SELECT "exchangeRate"::float8 AS rate FROM "Company" WHERE "id" = ${companyId}`;
    return row?.rate != null ? Number(row.rate) : 0;
  });
}

// Misma tasa como subconsulta, para las consultas que la usan dentro del SQL (sin esperar a leerla antes).
function rateSql(companyId: string): Prisma.Sql {
  return Prisma.sql`(SELECT COALESCE("exchangeRate"::float8, 0) FROM "Company" WHERE "id" = ${companyId})`;
}

export async function revenueTotals(range: DateRangeSelection) {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) {
      return { totalEurCents: 0, totalVES: 0, count: 0, avgEurCents: 0 };
    }

    // Sums each sale's own historical rate — except a credit sale that has
    // since been collected, which uses the rate in effect on the day it was
    // actually paid (paidExchangeRate), so this total stays reconciled with
    // what was actually collected instead of the stale rate at sale time.
    // Falls back to the company's current rate for pre-feature sales with no
    // snapshot at all. Total, cantidad y bolívares en una sola pasada por las ventas.
    const [row] = await bq<{ total: number | null; n: number; ves_total: number | null }>(tx)`
      SELECT SUM("totalCents")::bigint AS total, COUNT(*)::bigint AS n,
             COALESCE(SUM("totalCents"::numeric * COALESCE("paidExchangeRate", "exchangeRate", ${rateSql(companyId)}) / 100), 0) AS ves_total
      FROM "Sale"
      WHERE "companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('"createdAt"', windows)} AND "voided" = false
    `;
    const totalEurCents = Number(row?.total ?? 0);
    const count = Number(row?.n ?? 0);

    return {
      totalEurCents,
      totalVES: Number(row?.ves_total ?? 0),
      count,
      avgEurCents: count > 0 ? Math.round(totalEurCents / count) : 0,
    };
  });
}

// Revenue for the selected period next to the comparable previous one. Like
// every revenue figure here it only counts days with a cierre de caja, so the
// number of closed days on each side is returned too: the UI shows it, since a
// period with fewer closed days will naturally look smaller.
export async function revenueComparison(range: DateRangeSelection) {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const comparison = comparisonWindows(range);
  if (!comparison) return null;
  const currentWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    async function closedRevenue(windows: { start: Date; end: Date }[]) {
      const closed = await closedDayWindows(tx, companyId, branchId, windows);
      if (closed.length === 0) return { cents: 0, count: 0, days: 0 };
      const [row] = await bq<{ total: number | null; n: number }>(tx)`
        SELECT SUM("totalCents")::bigint AS total, COUNT(*)::bigint AS n
        FROM "Sale"
        WHERE "companyId" = ${companyId}
          ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
          AND ${windowsSql('"createdAt"', closed)} AND "voided" = false
      `;
      return { cents: Number(row?.total ?? 0), count: Number(row?.n ?? 0), days: closed.length };
    }
    const [current, previous] = await Promise.all([closedRevenue(currentWindows), closedRevenue(comparison.windows)]);
    return {
      currentCents: current.cents,
      previousCents: previous.cents,
      currentCount: current.count,
      previousCount: previous.count,
      currentDays: current.days,
      previousDays: previous.days,
      label: comparison.label,
    };
  });
}

export async function receivablesTotals() {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");

  return withTenant(companyId, async (tx) => {
    // Ventas a crédito pendientes y lo ya abonado a ellas («por cobrar» es el saldo pendiente, igual que
    // en Cuentas por cobrar): las dos sumas en una sola sentencia.
    const branchSql = branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty;
    const [currentRate, [row]] = await Promise.all([getCurrentRate(tx, companyId), bq<{ total: number | null; n: number; paid: number | null }>(tx)`
      SELECT (SELECT SUM(s."totalCents") FROM "Sale" s WHERE s."companyId" = ${companyId} ${branchSql} AND s."voided" = false AND s."paymentStatus"::text = 'CREDIT')::bigint AS total,
             (SELECT COUNT(*) FROM "Sale" s WHERE s."companyId" = ${companyId} ${branchSql} AND s."voided" = false AND s."paymentStatus"::text = 'CREDIT')::bigint AS n,
             (SELECT SUM(sp."amountEurCents") FROM "SalePayment" sp JOIN "Sale" s ON s."id" = sp."saleId"
               WHERE s."companyId" = ${companyId} ${branchSql} AND s."voided" = false AND s."paymentStatus"::text = 'CREDIT')::bigint AS paid
    `]);
    const totalEurCents = Math.max(0, Number(row?.total ?? 0) - Number(row?.paid ?? 0));
    const count = Number(row?.n ?? 0);

    // Unlike settled sales, an outstanding credit balance isn't worth a fixed
    // amount of bolívares until it's collected — always value it at today's
    // rate rather than the (possibly stale) rate from whenever it was sold.
    const totalVES = totalEurCents * (currentRate ?? 0) / 100;

    return {
      totalEurCents,
      totalVES,
      count,
    };
  });
}

export async function salesByDay(range: DateRangeSelection): Promise<SalesByDayPoint[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);

  const rows = await withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];

    // "createdAt" is stored as a naive UTC timestamp; convert to the shop's local
    // timezone before truncating so a day bucket matches the shop's actual business day.
    return bq<{ day: string; totalEurCents: number; totalVES: number; count: number }>(tx)`
      SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE})::date AS day,
             SUM("totalCents")::bigint AS "totalEurCents",
             COALESCE(SUM("totalCents"::numeric * COALESCE("paidExchangeRate", "exchangeRate", ${rateSql(companyId)}) / 100), 0) AS "totalVES",
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
    // La columna `date` llega como «YYYY-MM-DD».
    day: r.day.slice(0, 10),
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
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];

    const rows = await bq<{ currency: string; total_cents: bigint }>(tx)`
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
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);
  const grouped = await withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];
    return bq<{ productId: string | null; productName: string; category: string | null; quantity: number; revenue: number }>(tx)`
      SELECT si."productId", si."productName", si."category",
             SUM(si."quantity")::bigint AS quantity, SUM(si."subtotalCents")::bigint AS revenue
      FROM "SaleItem" si
      JOIN "Sale" s ON s."id" = si."saleId"
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('s."createdAt"', windows)} AND s."voided" = false
      GROUP BY si."productId", si."productName", si."category"
      ORDER BY SUM(si."quantity") DESC
      LIMIT ${limit}
    `;
  });
  return grouped.map((g) => ({
    productId: g.productId,
    productName: g.productName,
    category: g.category,
    quantity: Number(g.quantity),
    revenueCents: Number(g.revenue),
  }));
}

// Every active product, ranked by units sold ascending (0 first) — a LEFT
// JOIN from Product rather than grouping SaleItem, so a product that hasn't
// sold at all in the range still shows up as "0 vendidos" instead of being
// invisible. That's the useful signal here: dead stock, not just the
// bottom of what happened to sell.
export async function bottomProducts(range: DateRangeSelection, limit = 10): Promise<BottomProductPoint[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    // No closed day at all in range — every active product still shows up
    // (that's the point, see doc-comment above), just with quantity 0 for
    // all of them, same as if none had sold.
    const saleMatch = windows.length === 0 ? Prisma.sql`FALSE` : windowsSql('"createdAt"', windows);

    return bq<{ id: string; name: string; category: string | null; quantity: bigint }>(tx)`
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

export type PaymentMixRow = { method: string; totalCents: number; count: number };

// Distribución de ventas: cuánto se cobró por cada método de pago en el periodo
// (en la divisa de referencia), de mayor a menor.
export async function salesByPaymentMethod(range: DateRangeSelection): Promise<PaymentMixRow[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];
    const rows = await bq<{ method: string; total: bigint; n: bigint }>(tx)`
      SELECT sp."paymentMethod"::text AS method,
             SUM(sp."amountEurCents")::bigint AS total,
             COUNT(*)::bigint AS n
      FROM "SalePayment" sp
      JOIN "Sale" s ON s.id = sp."saleId"
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('sp."createdAt"', windows)}
        AND s."voided" = false
      GROUP BY 1
      ORDER BY total DESC
    `;
    return rows.map((r) => ({ method: r.method, totalCents: Number(r.total), count: Number(r.n) }));
  });
}

export type PurchasedProductRow = { name: string; quantity: number; totalCents: number };

// Productos más comprados: unidades compradas a proveedores en el periodo
// (compras anuladas no cuentan).
export async function mostPurchasedProducts(range: DateRangeSelection, limit = 10): Promise<PurchasedProductRow[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const windows = selectionToWindows(range);
  if (windows.length === 0) return [];
  return withTenant(companyId, async (tx) => {
    const rows = await bq<{ name: string; qty: bigint; cents: bigint }>(tx)`
      SELECT pi."productName" AS name,
             SUM(pi."quantity")::bigint AS qty,
             SUM(pi."subtotalCents")::bigint AS cents
      FROM "PurchaseItem" pi
      JOIN "Purchase" p ON p.id = pi."purchaseId"
      WHERE p."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('p."createdAt"', windows)}
        AND p."voided" = false
      GROUP BY 1
      ORDER BY qty DESC, name ASC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({ name: r.name, quantity: Number(r.qty), totalCents: Number(r.cents) }));
  });
}

export type RotationRow = { name: string; sold: number; stock: number; turns: number };

// Rotación: cuántas veces se vendió el stock actual en el periodo
// (unidades vendidas ÷ stock actual; con stock 0 se cuenta como 1 para no dividir
// entre cero). Solo productos con control de stock que vendieron algo.
export async function inventoryRotation(range: DateRangeSelection, limit = 10): Promise<RotationRow[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];
    const rows = await bq<{ name: string; sold: bigint; stock: number }>(tx)`
      SELECT pr."name" AS name, SUM(si."quantity")::bigint AS sold, pr."stock" AS stock
      FROM "Product" pr
      JOIN "SaleItem" si ON si."productId" = pr.id
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE pr."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND pr."branchId" = ${branchId}` : Prisma.empty}
        AND pr."trackStock" = true
        AND s."voided" = false
        AND ${windowsSql('s."createdAt"', windows)}
      GROUP BY pr.id, pr."name", pr."stock"
      ORDER BY SUM(si."quantity")::numeric / GREATEST(pr."stock", 1) DESC, pr."name" ASC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      name: r.name,
      sold: Number(r.sold),
      stock: r.stock,
      turns: Math.round((Number(r.sold) / Math.max(r.stock, 1)) * 100) / 100,
    }));
  });
}

export type CustomerMix = { total: number; newCount: number; returningCount: number };

// Clientes atendidos en el período: «nuevos» = su primera compra cae dentro del
// período; «recurrentes» = ya habían comprado antes. Ventas anuladas no cuentan.
export async function customerMix(range: DateRangeSelection): Promise<CustomerMix> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const windows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const rows = await bq<{ new_n: bigint; ret_n: bigint }>(tx)`
      WITH inrange AS (
        SELECT DISTINCT s."customerId"
        FROM "Sale" s
        WHERE s."companyId" = ${companyId}
          ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
          AND s."voided" = false AND s."customerId" IS NOT NULL
          AND ${windowsSql('s."createdAt"', windows)}
      )
      SELECT
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM "Sale" p
          WHERE p."companyId" = ${companyId} AND p."customerId" = i."customerId" AND p."voided" = false
            AND p."createdAt" < ${windows.reduce((m, w) => (w.start < m ? w.start : m), windows[0].start)}
        ))::bigint AS new_n,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "Sale" p
          WHERE p."companyId" = ${companyId} AND p."customerId" = i."customerId" AND p."voided" = false
            AND p."createdAt" < ${windows.reduce((m, w) => (w.start < m ? w.start : m), windows[0].start)}
        ))::bigint AS ret_n
      FROM inrange i
    `;
    const r = rows[0];
    const newCount = Number(r?.new_n ?? 0);
    const returningCount = Number(r?.ret_n ?? 0);
    return { total: newCount + returningCount, newCount, returningCount };
  });
}

export type RestockSuggestion = {
  id: string;
  name: string;
  stock: number;
  daysLeft: number | null;
  suggestedQty: number;
  estimatedCostCents: number | null;
  /** Unidades vendidas en la ventana de cálculo. */
  soldInWindow: number;
  /** Ritmo de venta usado (unidades por día). */
  perDay: number;
  /** Nivel ideal de existencia al que se repone. */
  idealQty: number;
  /** Mínimo configurado del producto (alerta de stock bajo). */
  minStock: number;
};

// Reposición sugerida: solo productos activos con control de stock que vendieron algo en 30 días.
// Es una sugerencia, no una orden: lo ya pedido y aún no recibido no existe en el sistema.
export async function restockSuggestions(limit = 8): Promise<RestockSuggestion[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const since = new Date(Date.now() - RESTOCK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return withTenant(companyId, async (tx) => {
    const rows = await bq<{ id: string; name: string; stock: number; cost: number | null; min_stock: number; sold: bigint; active_days: number }>(tx)`
      SELECT pr.id, pr."name" AS name, pr."stock" AS stock, pr."costCents" AS cost, pr."lowStockThreshold" AS min_stock, SUM(si."quantity")::bigint AS sold,
             LEAST(${RESTOCK_WINDOW_DAYS}, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (NOW() - GREATEST(${since}::timestamptz, pr."createdAt"))) / 86400.0)))::float AS active_days
      FROM "Product" pr
      JOIN "SaleItem" si ON si."productId" = pr.id
      JOIN "Sale" s ON s.id = si."saleId"
      WHERE pr."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND pr."branchId" = ${branchId}` : Prisma.empty}
        AND pr."isActive" = true AND pr."trackStock" = true
        AND s."voided" = false AND s."createdAt" >= ${since}
      GROUP BY pr.id, pr."name", pr."stock", pr."costCents", pr."lowStockThreshold", pr."createdAt"
    `;
    return rows
      .map((r) => {
        const sold = Number(r.sold);
        const plan = restockPlan({ sold, activeDays: r.active_days, stock: r.stock, minStock: r.min_stock });
        return {
          id: r.id,
          name: r.name,
          stock: r.stock,
          daysLeft: plan.perDay > 0 ? Math.floor(Math.max(0, r.stock) / plan.perDay) : null,
          suggestedQty: plan.need,
          estimatedCostCents: r.cost != null ? plan.need * r.cost : null,
          soldInWindow: sold,
          perDay: plan.perDay,
          idealQty: plan.ideal,
          minStock: r.min_stock,
        };
      })
      .filter((x) => x.suggestedQty > 0)
      .sort((a, b) => (a.daysLeft ?? 999) - (b.daysLeft ?? 999))
      .slice(0, limit);
  });
}

export type PeriodExtras = { prevCount: number; prevAvgCents: number; prevExpensesCents: number; prevDays: number; label: string };

// Valores del periodo anterior comparable (mismo criterio que revenueComparison:
// solo días con cierre de caja en las ventas) para mostrar la variación de venta
// promedio, número de ventas y gastos en Estadísticas.
export async function periodExtras(range: DateRangeSelection): Promise<PeriodExtras | null> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const comparison = comparisonWindows(range);
  if (!comparison) return null;
  return withTenant(companyId, async (tx) => {
    const closed = await closedDayWindows(tx, companyId, branchId, comparison.windows);
    const [sales, expenses] = await Promise.all([
      closed.length === 0
        ? Promise.resolve([{ total: 0 as number | null, n: 0 }])
        : bq<{ total: number | null; n: number }>(tx)`
            SELECT SUM("totalCents")::bigint AS total, COUNT(*)::bigint AS n
            FROM "Sale"
            WHERE "companyId" = ${companyId}
              ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
              AND ${windowsSql('"createdAt"', closed)} AND "voided" = false
          `,
      bq<{ total: number | null }>(tx)`
        SELECT SUM("amountCents")::bigint AS total
        FROM "Expense"
        WHERE "companyId" = ${companyId}
          ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
          AND ${windowsSql('"spentAt"', comparison.windows)}
      `,
    ]);
    const count = Number(sales[0]?.n ?? 0);
    const cents = Number(sales[0]?.total ?? 0);
    return {
      prevCount: count,
      prevAvgCents: count > 0 ? Math.round(cents / count) : 0,
      prevExpensesCents: Number(expenses[0]?.total ?? 0),
      prevDays: closed.length,
      label: comparison.label,
    };
  });
}

export type WeeklyRow = { from: string; to: string; label: string; cents: number; count: number };

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Reporte semanal: las últimas 4 semanas (lunes a domingo, hora de Venezuela) con
// ventas y pedidos. Se calcula al abrir Estadísticas; no se envía por correo.
export async function weeklyReports(): Promise<WeeklyRow[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const today = todayDateString();
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunes
  const thisMonday = addDaysStr(today, -dow);
  const fmt = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", timeZone: "UTC" });
  return withTenant(companyId, async (tx) => {
    const weeks = [0, 1, 2, 3].map((i) => {
      const from = addDaysStr(thisMonday, -7 * i);
      const to = addDaysStr(from, 6);
      return { from, to };
    });
    // Las 4 semanas en una sola sentencia agrupada.
    return Promise.all(
      weeks.map(async (w) => {
        const start = dayBoundsUtc(w.from).start;
        const end = dayBoundsUtc(w.to).end;
        const [r] = await bq<{ total: number | null; n: number }>(tx)`
          SELECT SUM("totalCents")::bigint AS total, COUNT(*)::bigint AS n
          FROM "Sale"
          WHERE "companyId" = ${companyId} ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
            AND "voided" = false AND "createdAt" >= ${start} AND "createdAt" < ${end}
        `;
        return {
          from: w.from,
          to: w.to,
          label: `${fmt.format(new Date(`${w.from}T12:00:00Z`))} al ${fmt.format(new Date(`${w.to}T12:00:00Z`))}`,
          cents: Number(r?.total ?? 0),
          count: Number(r?.n ?? 0),
        };
      })
    );
  });
}

export async function getWeeklyReportEnabled(): Promise<boolean> {
  const { companyId } = await requireManagerOrPermission("stats", "admin");
  const [c] = await withTenant(companyId, (tx) => bq<{ on: boolean }>(tx)`SELECT "weeklyReportEnabled" AS "on" FROM "Company" WHERE "id" = ${companyId}`);
  return c?.on ?? false;
}

export async function setWeeklyReportEnabled(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  const { companyId } = await requireManager();
  await withTenant(companyId, (tx) => tx.company.update({ where: { id: companyId }, data: { weeklyReportEnabled: enabled } }));
  return { success: true };
}

export type TicketBucketRow = { bucket: number; count: number };

// Distribución de ventas: cuántas ventas del periodo caen en cada tramo de monto
// (en la divisa de referencia). Tramos de TICKET_BUCKET_LIMITS (lib/stats-view.ts):
// 0-10, 10-20, 20-30, 30-50, 50-80 y 80+. Igual que el resto de cifras de
// ventas, solo cuenta días con cierre de caja. Solo lectura.
export async function ticketDistribution(range: DateRangeSelection): Promise<TicketBucketRow[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats", "admin");
  const requestedWindows = selectionToWindows(range);
  return withTenant(companyId, async (tx) => {
    const windows = await closedDayWindows(tx, companyId, branchId, requestedWindows);
    if (windows.length === 0) return [];
    const rows = await bq<{ b: number; n: bigint }>(tx)`
      SELECT CASE
               WHEN "totalCents" < 1000 THEN 0
               WHEN "totalCents" < 2000 THEN 1
               WHEN "totalCents" < 3000 THEN 2
               WHEN "totalCents" < 5000 THEN 3
               WHEN "totalCents" < 8000 THEN 4
               ELSE 5
             END AS b,
             COUNT(*)::bigint AS n
      FROM "Sale"
      WHERE "companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
        AND ${windowsSql('"createdAt"', windows)} AND "voided" = false
      GROUP BY 1
    `;
    return rows.map((r) => ({ bucket: Number(r.b), count: Number(r.n) }));
  });
}
