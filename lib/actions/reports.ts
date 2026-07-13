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

export async function revenueTotals(range: DateRangePreset) {
  const { companyId } = await requireSession();
  const { start, end } = rangeToDates(range);
  const result = await prisma.sale.aggregate({
    _sum: { totalCents: true },
    _count: true,
    where: { companyId, createdAt: { gte: start, lte: end } },
  });
  const totalCents = result._sum.totalCents ?? 0;
  const count = result._count;
  return {
    totalCents,
    count,
    avgCents: count > 0 ? Math.round(totalCents / count) : 0,
  };
}

export async function salesByDay(range: DateRangePreset): Promise<SalesByDayPoint[]> {
  const { companyId } = await requireSession();
  const { start, end } = rangeToDates(range);
  // "createdAt" is stored as a naive UTC timestamp; convert to the shop's local
  // timezone before truncating so a day bucket matches the shop's actual business day.
  const rows = await prisma.$queryRaw<
    { day: Date; totalCents: bigint; count: bigint }[]
  >`
    SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE})::date AS day,
           SUM("totalCents")::bigint AS "totalCents",
           COUNT(*)::bigint AS count
    FROM "Sale"
    WHERE "companyId" = ${companyId} AND "createdAt" >= ${start} AND "createdAt" <= ${end}
    GROUP BY day
    ORDER BY day ASC
  `;
  return rows.map((r) => ({
    // `date` columns come back as a UTC-midnight JS Date; read the Y-M-D with
    // UTC getters to avoid re-shifting the day in the server/client's own timezone.
    day: `${r.day.getUTCFullYear()}-${String(r.day.getUTCMonth() + 1).padStart(2, "0")}-${String(
      r.day.getUTCDate()
    ).padStart(2, "0")}`,
    totalCents: Number(r.totalCents),
    count: Number(r.count),
  }));
}

export async function topProducts(range: DateRangePreset, limit = 10): Promise<TopProductPoint[]> {
  const { companyId } = await requireSession();
  const { start, end } = rangeToDates(range);
  const grouped = await prisma.saleItem.groupBy({
    by: ["productId", "productName"],
    where: { sale: { companyId, createdAt: { gte: start, lte: end } } },
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
