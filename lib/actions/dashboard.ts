"use server";

import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { listPendingClosings } from "@/lib/actions/cash-closing";
import { Prisma } from "@prisma/client";

export async function getDashboardTasks() {
  const { companyId, branchId } = await requireManager();
  const [lowStock, pendingQuotes, pendingClosings] = await Promise.all([
    withTenant(companyId, async (tx) => {
      const [count, products] = await Promise.all([
        tx.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count FROM "Product"
          WHERE "companyId" = ${companyId}
            ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
            AND "trackStock" = true AND "stock" <= "lowStockThreshold"
            AND ("isActive" = true OR "stock" = 0)
        `,
        tx.$queryRaw<{ id: string; name: string; stock: number; lowStockThreshold: number }[]>`
          SELECT "id", "name", "stock", "lowStockThreshold" FROM "Product"
          WHERE "companyId" = ${companyId}
            ${branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty}
            AND "trackStock" = true AND "stock" <= "lowStockThreshold"
            AND ("isActive" = true OR "stock" = 0)
          ORDER BY "stock" ASC, "name" ASC LIMIT 3
        `,
      ]);
      return { count: Number(count[0]?.count ?? 0), products };
    }),
    withTenant(companyId, (tx) => tx.quote.count({ where: { companyId, ...(branchId ? { branchId } : {}), status: "PENDING" } })),
    listPendingClosings({ kind: "preset", preset: "7d" }),
  ]);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Caracas" }).format(new Date());
  const completedDays = pendingClosings.filter((closing) => closing.date < today);
  return { lowStock, pendingQuotes, pendingClosingCount: completedDays.length, pendingClosings: completedDays.slice(0, 3) };
}
