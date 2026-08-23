"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { rangeToDates, type DateRangePreset } from "@/lib/report-types";
import type { ActionResult } from "@/lib/types";

export type SellerSalesOverviewRow = {
  userId: string;
  name: string;
  count: number;
  totalEurCents: number;
  commissionPercent: number | null;
  commissionCents: number;
};

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
export async function sellersSalesOverview(range: DateRangePreset): Promise<SellerSalesOverviewRow[]> {
  const { companyId, branchId } = await requireManager();
  const { start, end } = rangeToDates(range);

  return withTenant(companyId, async (tx) => {
    const [employees, grouped] = await Promise.all([
      tx.user.findMany({ where: { companyId }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
      tx.sale.groupBy({
        by: ["sellerId"],
        where: {
          companyId,
          ...(branchId ? { branchId } : {}),
          createdAt: { gte: start, lte: end },
          voided: false,
          sellerId: { not: null },
        },
        _sum: { totalCents: true },
        _count: true,
      }),
    ]);

    const bySeller = new Map(grouped.map((g) => [g.sellerId as string, g]));

    return employees
      .map((u) => {
        const g = bySeller.get(u.id);
        const totalEurCents = g?._sum.totalCents ?? 0;
        const count = g?._count ?? 0;
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
  start: Date,
  end: Date
) {
  return tx.sale.findMany({
    where: {
      companyId,
      ...(branchId ? { branchId } : {}),
      sellerId,
      createdAt: { gte: start, lte: end },
      voided: false,
    },
    orderBy: { createdAt: "desc" },
    include: { items: true, payments: true },
  });
}

export async function sellerSalesDetail(sellerId: string, range: DateRangePreset): Promise<SellerSalesDetail | null> {
  const { companyId, branchId } = await requireManager();
  const { start, end } = rangeToDates(range);

  return withTenant(companyId, async (tx) => {
    const seller = await tx.user.findFirst({ where: { id: sellerId, companyId } });
    if (!seller) return null;

    const sales = await loadSellerSales(tx, companyId, branchId, sellerId, start, end);
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
