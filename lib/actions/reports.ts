"use server";

import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import {
  rangeToDates,
  SHOP_TIME_ZONE,
  type DateRangePreset,
  type SalesByDayPoint,
  type TopProductPoint,
} from "@/lib/report-types";

async function getCurrentRate(companyId: string): Promise<number> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { exchangeRate: true },
  });
  return company?.exchangeRate != null ? Number(company.exchangeRate) : 0;
}

export async function revenueTotals(range: DateRangePreset) {
  const { companyId } = await requireSession();
  const { start, end } = rangeToDates(range);
  const currentRate = await getCurrentRate(companyId);

  const result = await prisma.sale.aggregate({
    _sum: { totalCents: true },
    _count: true,
    where: { companyId, createdAt: { gte: start, lte: end }, voided: false },
  });
  const totalEurCents = result._sum.totalCents ?? 0;
  const count = result._count;

  // Sums each sale's own historical rate (falling back to the company's
  // current rate for pre-feature sales with no snapshot), so this reflects
  // the real bolívares collected in the period rather than today's value.
  const [vesRow] = await prisma.$queryRaw<{ ves_total: number | null }[]>`
    SELECT COALESCE(SUM("totalCents"::numeric * COALESCE("exchangeRate", ${currentRate}) / 100), 0) AS ves_total
    FROM "Sale"
    WHERE "companyId" = ${companyId} AND "createdAt" >= ${start} AND "createdAt" <= ${end} AND "voided" = false
  `;

  return {
    totalEurCents,
    totalVES: Number(vesRow?.ves_total ?? 0),
    count,
    avgEurCents: count > 0 ? Math.round(totalEurCents / count) : 0,
  };
}

export async function receivablesTotals() {
  const { companyId } = await requireSession();
  const currentRate = await getCurrentRate(companyId);

  const result = await prisma.sale.aggregate({
    _sum: { totalCents: true },
    _count: true,
    where: { companyId, voided: false, paymentStatus: "CREDIT" },
  });
  const totalEurCents = result._sum.totalCents ?? 0;
  const count = result._count;

  const [vesRow] = await prisma.$queryRaw<{ ves_total: number | null }[]>`
    SELECT COALESCE(SUM("totalCents"::numeric * COALESCE("exchangeRate", ${currentRate}) / 100), 0) AS ves_total
    FROM "Sale"
    WHERE "companyId" = ${companyId} AND "voided" = false AND "paymentStatus" = 'CREDIT'
  `;

  return {
    totalEurCents,
    totalVES: Number(vesRow?.ves_total ?? 0),
    count,
  };
}

export async function salesByDay(range: DateRangePreset): Promise<SalesByDayPoint[]> {
  const { companyId } = await requireSession();
  const { start, end } = rangeToDates(range);
  const currentRate = await getCurrentRate(companyId);

  // "createdAt" is stored as a naive UTC timestamp; convert to the shop's local
  // timezone before truncating so a day bucket matches the shop's actual business day.
  const rows = await prisma.$queryRaw<
    { day: Date; totalEurCents: bigint; totalVES: number; count: bigint }[]
  >`
    SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE})::date AS day,
           SUM("totalCents")::bigint AS "totalEurCents",
           COALESCE(SUM("totalCents"::numeric * COALESCE("exchangeRate", ${currentRate}) / 100), 0) AS "totalVES",
           COUNT(*)::bigint AS count
    FROM "Sale"
    WHERE "companyId" = ${companyId} AND "createdAt" >= ${start} AND "createdAt" <= ${end} AND "voided" = false
    GROUP BY day
    ORDER BY day ASC
  `;
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

export async function topProducts(range: DateRangePreset, limit = 10): Promise<TopProductPoint[]> {
  const { companyId } = await requireSession();
  const { start, end } = rangeToDates(range);
  const grouped = await prisma.saleItem.groupBy({
    by: ["productId", "productName"],
    where: { sale: { companyId, createdAt: { gte: start, lte: end }, voided: false } },
    _sum: { quantity: true, subtotalCents: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit,
  });
  return grouped.map((g) => ({
    productId: g.productId,
    productName: g.productName,
    quantity: g._sum.quantity ?? 0,
    revenueCents: g._sum.subtotalCents ?? 0,
  }));
}
