"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireManagerOrPermission } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { Prisma } from "@prisma/client";
import { bq } from "@/lib/batch-sql";
import { closedDayWindows } from "@/lib/closed-days";
import { selectionToWindows, type DateRangeSelection } from "@/lib/report-types";
import type { ActionResult } from "@/lib/types";

export type SellerSalesOverviewRow = {
  userId: string;
  name: string;
  count: number;
  totalEurCents: number;
  commissionPercent: number | null;
  commissionCents: number;
};

function windowsSql(column: string, windows: { start: Date; end: Date }[]): Prisma.Sql {
  const parts = windows.map((w) => Prisma.sql`(${Prisma.raw(column)} >= ${w.start} AND ${Prisma.raw(column)} < ${w.end})`);
  return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
}

function sellerDisplayName(u: { firstName: string | null; lastName: string | null; email: string }): string {
  const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return full || u.email;
}

// One row per employee (not just whoever has sales) so a seller with zero
// sales this period still shows up at 0 — matches how the owner described
// wanting to see "cuántas ventas vendió el vendedor uno, el vendedor dos...".
// Voided sales are excluded everywhere in this report, same as
// revenueTotals() in lib/actions/reports.ts — a voided sale shouldn't count
// toward anyone's commission.
export async function sellersSalesOverview(range: DateRangeSelection, opts: { closedOnly?: boolean } = {}): Promise<SellerSalesOverviewRow[]> {
  const { companyId, branchId } = await requireManagerOrPermission("admin", "stats");
  const requestedWindows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    // closedOnly (usado por commissionsTotal): igual que ventas y costo en
    // Inicio/Estadísticas, solo días con cierre de caja. Sin esto la comisión
    // se restaba de una utilidad con ventas en $0.
    const windows = opts.closedOnly
      ? await closedDayWindows(tx, companyId, branchId, requestedWindows)
      : requestedWindows;
    const [employees, grouped] = await Promise.all([
      bq<{ id: string; firstName: string | null; lastName: string | null; email: string; commissionPercent: number | null }>(tx)`
        SELECT "id", "firstName", "lastName", "email", "commissionPercent"::float8 AS "commissionPercent"
        FROM "User" WHERE "companyId" = ${companyId} ORDER BY "role" ASC, "createdAt" ASC`,
      windows.length === 0
        ? Promise.resolve([] as { sellerId: string; total: number | null; n: number }[])
        : bq<{ sellerId: string; total: number | null; n: number }>(tx)`
            SELECT "sellerId", SUM("totalCents")::bigint AS total, COUNT(*)::bigint AS n
            FROM "Sale"
            WHERE "companyId" = ${companyId}
              ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
              AND ${windowsSql('"createdAt"', windows)} AND "voided" = false AND "sellerId" IS NOT NULL
            GROUP BY "sellerId"`,
    ]);

    const bySeller = new Map(grouped.map((g) => [g.sellerId, g]));

    return employees
      .map((u) => {
        const g = bySeller.get(u.id);
        const totalEurCents = Number(g?.total ?? 0);
        const count = Number(g?.n ?? 0);
        const commissionPercent = u.commissionPercent != null ? Number(u.commissionPercent) : null;
        const commissionCents =
          commissionPercent != null ? Math.round((totalEurCents * commissionPercent) / 100) : 0;
        return {
          userId: u.id,
          name: sellerDisplayName(u),
          count,
          totalEurCents,
          commissionPercent,
          commissionCents,
        };
      })
      .sort((a, b) => b.totalEurCents - a.totalEurCents);
  });
}

export type SellerSalesDetail = {
  userId: string;
  name: string;
  commissionPercent: number | null;
  count: number;
  totalEurCents: number;
  commissionCents: number;
  sales: Awaited<ReturnType<typeof loadSellerSales>>;
};

async function loadSellerSales(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  companyId: string,
  branchId: string | null,
  sellerId: string,
  windows: { start: Date; end: Date }[]
) {
  return tx.sale.findMany({
    where: {
      companyId,
      ...(branchId ? { branchId } : {}),
      sellerId,
      OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
      voided: false,
    },
    orderBy: { createdAt: "desc" },
    include: { items: true, payments: true, creditNote: { select: { controlNumber: true, createdAt: true, reason: true } }, debitNotes: { select: { controlNumber: true, createdAt: true, reason: true, totalCents: true, baseImponibleCents: true, taxCents: true }, orderBy: { controlNumber: "asc" } } },
  });
}

export async function sellerSalesDetail(sellerId: string, range: DateRangeSelection): Promise<SellerSalesDetail | null> {
  const { companyId, branchId } = await requireManagerOrPermission("admin", "stats");
  const windows = selectionToWindows(range);

  return withTenant(companyId, async (tx) => {
    const seller = await tx.user.findFirst({ where: { id: sellerId, companyId } });
    if (!seller) return null;

    const sales = await loadSellerSales(tx, companyId, branchId, sellerId, windows);
    const totalEurCents = sales.reduce((sum, s) => sum + s.totalCents, 0);
    const commissionPercent = seller.commissionPercent != null ? Number(seller.commissionPercent) : null;
    const commissionCents = commissionPercent != null ? Math.round((totalEurCents * commissionPercent) / 100) : 0;

    return {
      userId: seller.id,
      name: sellerDisplayName(seller),
      commissionPercent,
      count: sales.length,
      totalEurCents,
      commissionCents,
      sales,
    };
  });
}

export async function updateSellerCommission(userId: string, percent: number | null): Promise<ActionResult> {
  const { companyId } = await requireManager();
  if (percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
    return { success: false, error: "El porcentaje debe estar entre 0 y 100" };
  }

  const { count } = await withTenant(companyId, (tx) =>
    tx.user.updateMany({ where: { id: userId, companyId }, data: { commissionPercent: percent } })
  );
  if (count === 0) return { success: false, error: "Vendedor no encontrado" };

  revalidatePath("/accounting/sellers");
  return { success: true };
}

// Comisiones de los vendedores en el período (se restan de la ganancia neta,
// como en la preview v15).
export async function commissionsTotal(range: DateRangeSelection): Promise<number> {
  const rows = await sellersSalesOverview(range, { closedOnly: true });
  return rows.reduce((a, r) => a + r.commissionCents, 0);
}
