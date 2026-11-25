"use server";

import { Prisma } from "@prisma/client";
import { requireManager, requireManagerOrPermission } from "@/lib/session";
import { bq } from "@/lib/batch-sql";
import { withTenant } from "@/lib/tenant-db";
import { dayBoundsUtc, SHOP_TIME_ZONE, todayDateString } from "@/lib/report-types";

export type HourPoint = { hour: number; count: number; cents: number };

// Ventas de HOY por hora (hora de Venezuela), para «Ventas por hora» en Inicio.
// Usa las ventas reales de hoy, no los días con cierre de caja (hoy aún no cierra).
export async function salesByHourToday(): Promise<HourPoint[]> {
  const { companyId, branchId } = await requireManager();
  const { start, end } = dayBoundsUtc(todayDateString());
  return withTenant(companyId, async (tx) => {
    const rows = await bq<{ h: number; n: bigint; cents: bigint }>(tx)`
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
  paid: { paymentMethod: string; currencyCode: string | null; amountCurrencyCents: number | null; amountEurCents: number }[];
  onCredit: boolean;
};

// Las últimas ventas (no anuladas), de la más reciente a la más antigua.
export async function latestSales(limit = 5): Promise<LatestSale[]> {
  const { companyId, branchId } = await requireManager();
  type Row = {
    id: string;
    controlNumber: number | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    totalCents: number;
    paymentStatus: string;
    payments: { paymentMethod: string; currencyCode: string | null; amountCurrencyCents: number | null; amountEurCents: number }[];
  };
  // Venta y sus cobros en una sola consulta (antes: ventas + cobros).
  const rows = await withTenant(companyId, (tx) =>
    bq<Row>(tx)`
      SELECT s."id", s."controlNumber", s."customerFirstName", s."customerLastName", s."totalCents", s."paymentStatus"::text AS "paymentStatus",
             COALESCE((SELECT json_agg(json_build_object('paymentMethod', p."paymentMethod"::text, 'currencyCode', p."currencyCode",
                                                         'amountCurrencyCents', p."amountCurrencyCents", 'amountEurCents', p."amountEurCents")
                                       ORDER BY p."createdAt", p."id")
                       FROM "SalePayment" p WHERE p."saleId" = s."id"), '[]'::json) AS "payments"
      FROM "Sale" s
      WHERE s."companyId" = ${companyId} ${branchId ? Prisma.sql`AND s."branchId" = ${branchId}` : Prisma.empty} AND s."voided" = false
      ORDER BY s."createdAt" DESC
      LIMIT ${limit}
    `
  );
  return rows.map((s) => ({
    id: s.id,
    number: s.controlNumber,
    customer: [s.customerFirstName, s.customerLastName].filter(Boolean).join(" ") || "Cliente general",
    methods: [...new Set(s.payments.map((p) => p.paymentMethod as string))],
    totalCents: s.totalCents,
    paid: s.payments.map((p) => ({ paymentMethod: p.paymentMethod as string, currencyCode: p.currencyCode, amountCurrencyCents: p.amountCurrencyCents, amountEurCents: p.amountEurCents })),
    onCredit: s.paymentStatus === "CREDIT",
  }));
}

export type HeatCell = { dow: number; hour: number; count: number };

// Mapa de calor: ventas por día de la semana (0 = lunes) y hora (8 a 20, hora de
// Venezuela) en las últimas 8 semanas. Usa ventas reales, no solo días cerrados.
export async function salesHeatmap(): Promise<HeatCell[]> {
  const { companyId, branchId } = await requireManagerOrPermission("stats");
  const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000);
  return withTenant(companyId, async (tx) => {
    const rows = await bq<{ d: number; h: number; n: bigint }>(tx)`
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
