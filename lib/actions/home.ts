"use server";

import { Prisma } from "@prisma/client";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { dayBoundsUtc, SHOP_TIME_ZONE, todayDateString } from "@/lib/report-types";

export type HourPoint = { hour: number; count: number; cents: number };

// Ventas de HOY por hora (hora de Venezuela), para «Ventas por hora» en Inicio.
// Usa las ventas reales de hoy, no los días con cierre de caja (hoy aún no cierra).
export async function salesByHourToday(): Promise<HourPoint[]> {
  const { companyId, branchId } = await requireManager();
  const { start, end } = dayBoundsUtc(todayDateString());
  return withTenant(companyId, async (tx) => {
    const rows = await tx.$queryRaw<{ h: number; n: bigint; cents: bigint }[]>`
      SELECT EXTRACT(HOUR FROM s."createdAt" AT TIME ZONE ${SHOP_TIME_ZONE})::int AS h,
             COUNT(*)::bigint AS n,
             COALESCE(SUM(s."totalCents"), 0)::bigint AS cents
      FROM "Sale" s
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND s."voided" = false
        AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({ hour: r.h, count: Number(r.n), cents: Number(r.cents) }));
  });
}

export type LatestSale = {
  id: string;
  number: number | null;
  customer: string;
  methods: string[];
  totalCents: number;
  onCredit: boolean;
};

// Las últimas ventas (no anuladas), de la más reciente a la más antigua.
export async function latestSales(limit = 5): Promise<LatestSale[]> {
  const { companyId, branchId } = await requireManager();
  const rows = await withTenant(companyId, (tx) =>
    tx.sale.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}), voided: false },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        controlNumber: true,
        customerFirstName: true,
        customerLastName: true,
        totalCents: true,
        paymentStatus: true,
        payments: { select: { paymentMethod: true } },
      },
    })
  );
  return rows.map((s) => ({
    id: s.id,
    number: s.controlNumber,
    customer: [s.customerFirstName, s.customerLastName].filter(Boolean).join(" ") || "Cliente general",
    methods: [...new Set(s.payments.map((p) => p.paymentMethod as string))],
    totalCents: s.totalCents,
    onCredit: s.paymentStatus === "CREDIT",
  }));
}

export type HeatCell = { dow: number; hour: number; count: number };

// Mapa de calor: ventas por día de la semana (0 = lunes) y hora (8 a 20, hora de
// Venezuela) en las últimas 8 semanas. Usa ventas reales, no solo días cerrados.
export async function salesHeatmap(): Promise<HeatCell[]> {
  const { companyId, branchId } = await requireManager();
  const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
  return withTenant(companyId, async (tx) => {
    const rows = await tx.$queryRaw<{ d: number; h: number; n: bigint }[]>`
      SELECT ((EXTRACT(DOW FROM s."createdAt" AT TIME ZONE ${SHOP_TIME_ZONE})::int + 6) % 7) AS d,
             EXTRACT(HOUR FROM s."createdAt" AT TIME ZONE ${SHOP_TIME_ZONE})::int AS h,
             COUNT(*)::bigint AS n
      FROM "Sale" s
      WHERE s."companyId" = ${companyId}
        ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty}
        AND s."voided" = false
        AND s."createdAt" >= ${since}
      GROUP BY 1, 2
    `;
    return rows.filter((r) => r.h >= 8 && r.h <= 20).map((r) => ({ dow: r.d, hour: r.h, count: Number(r.n) }));
  });
}
