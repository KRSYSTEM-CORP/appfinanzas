"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireSession, setSessionCookie } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { getOrSetCache, invalidateCache } from "@/lib/cache";
import { verifyPassword } from "@/lib/password";
import { checkRateLimit, recordFailedAttempt, clearAttempts, rateLimitMessage } from "@/lib/rate-limit";
import { dayBoundsUtc, todayDateString } from "@/lib/report-types";
import type { ActionResult } from "@/lib/types";

export async function listBranches() {
  const { companyId } = await requireSession();
  // Read on every page via the root layout (for the branch switcher) —
  // branches change only when a manager adds/edits one, which invalidates
  // this key below.
  return getOrSetCache(`branches:${companyId}`, 600, () =>
    withTenant(companyId, (tx) => tx.branch.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }))
  );
}

export async function createBranch(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { success: false, error: "El nombre de la sucursal es obligatorio" };

  try {
    await withTenant(companyId, (tx) => tx.branch.create({ data: { companyId, name } }));
  } catch {
    return { success: false, error: "Ya existe una sucursal con ese nombre" };
  }

  await invalidateCache(`branches:${companyId}`);
  revalidatePath("/settings");
  return { success: true };
}

export async function updateBranch(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  const isActive = formData.get("isActive") === "true";
  if (!name) return { success: false, error: "El nombre de la sucursal es obligatorio" };

  try {
    const result = await withTenant(companyId, (tx) =>
      tx.branch.updateMany({ where: { id, companyId }, data: { name, isActive } })
    );
    if (result.count === 0) return { success: false, error: "Sucursal no encontrada" };
  } catch {
    return { success: false, error: "Ya existe una sucursal con ese nombre" };
  }

  await invalidateCache(`branches:${companyId}`);
  revalidatePath("/settings");
  return { success: true };
}

// Entrar a una sede (o a «Todas las sucursales», branchId null) pide la clave de
// la cuenta del gerente/dueño: ya no se cambia de sede con un simple clic. Si la
// cuenta no tiene contraseña (entró con Google) no hay clave que pedir.
// Re-emite la cookie de sesión con la sede elegida. VENDEDOR nunca llama esto:
// siempre está fijo en su User.branchId (ver getSession() en lib/session.ts).
export async function enterBranch(branchId: string | null, password: string): Promise<ActionResult> {
  const session = await requireManager();
  if (branchId === (session.branchId ?? null)) return { success: true };

  const limit = await checkRateLimit("branch-enter", session.userId, 5, 15 * 60_000);
  if (!limit.allowed) return { success: false, error: rateLimitMessage(limit.retryAfterMinutes) };

  const user = await withTenant(session.companyId, (tx) =>
    tx.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } })
  );
  if (user?.passwordHash) {
    if (!password || !verifyPassword(password, user.passwordHash)) {
      await recordFailedAttempt("branch-enter", session.userId);
      return { success: false, error: "Clave incorrecta" };
    }
    await clearAttempts("branch-enter", session.userId);
  }

  if (branchId) {
    const branch = await withTenant(session.companyId, (tx) =>
      tx.branch.findFirst({ where: { id: branchId, companyId: session.companyId, isActive: true } })
    );
    if (!branch) return { success: false, error: "Sucursal no encontrada" };
  }

  await setSessionCookie({
    uid: session.userId,
    cid: session.companyId,
    companyName: session.companyName,
    bid: branchId,
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export type BranchSummary = {
  id: string;
  name: string;
  isActive: boolean;
  salesToday: number;
  salesTodayCents: number;
  products: number;
  users: number;
  // Ventas del mes en curso y productos con stock bajo (tarjetas de la preview).
  salesMonth: number;
  salesMonthCents: number;
  lowStock: number;
  // Ganancia neta estimada del mes = ventas − costo de lo vendido − gastos de la sede − comisiones.
  profitMonthCents: number;
  cogsMonthCents: number;
  expensesMonthCents: number;
  commissionsMonthCents: number;
  goalCents: number | null;
};

// Resumen visible de cada sede (ventas de hoy, productos y personal). Solo
// gerente/dueño; ver el resumen no requiere clave, entrar sí (enterBranch).
export async function branchOverview(): Promise<{ summaries: BranchSummary[]; currency: string }> {
  const { companyId } = await requireManager();
  const { start, end } = dayBoundsUtc(todayDateString());
  const monthStart = dayBoundsUtc(`${todayDateString().slice(0, 7)}-01`).start;
  return withTenant(companyId, async (tx) => {
    const [branches, company] = await Promise.all([
      tx.branch.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
      tx.company.findUnique({ where: { id: companyId }, select: { referenceCurrency: true } }),
    ]);
    const summaries = await Promise.all(
      branches.map(async (b) => {
        const [sales, products, users, month, low, cogs, expenses, commissions] = await Promise.all([
          tx.sale.aggregate({
            where: { companyId, branchId: b.id, voided: false, createdAt: { gte: start, lt: end } },
            _sum: { totalCents: true },
            _count: true,
          }),
          tx.product.count({ where: { companyId, branchId: b.id } }),
          tx.user.count({ where: { companyId, branchId: b.id, status: "ACTIVE" } }),
          tx.sale.aggregate({
            where: { companyId, branchId: b.id, voided: false, createdAt: { gte: monthStart, lt: end } },
            _sum: { totalCents: true },
            _count: true,
          }),
          tx.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(*)::bigint AS n FROM "Product"
            WHERE "companyId" = ${companyId} AND "branchId" = ${b.id} AND "isActive" = true
              AND "trackStock" = true AND "stock" <= "lowStockThreshold"`,
          tx.$queryRaw<{ c: bigint | null }[]>`
            SELECT COALESCE(SUM(si."quantity" * p."costCents"), 0)::bigint AS c
            FROM "SaleItem" si
            JOIN "Sale" s ON s.id = si."saleId"
            JOIN "Product" p ON p.id = si."productId"
            WHERE s."companyId" = ${companyId} AND s."branchId" = ${b.id} AND s."voided" = false
              AND s."createdAt" >= ${monthStart} AND s."createdAt" < ${end} AND p."costCents" IS NOT NULL`,
          tx.expense.aggregate({
            _sum: { amountCents: true },
            where: { companyId, branchId: b.id, spentAt: { gte: monthStart, lt: end } },
          }),
          // Comisiones de vendedores sobre las ventas del mes en esta sede.
          tx.$queryRaw<{ c: number | null }[]>`
            SELECT COALESCE(SUM(s."totalCents" * u."commissionPercent" / 100), 0)::float8 AS c
            FROM "Sale" s
            JOIN "User" u ON u.id = s."sellerId"
            WHERE s."companyId" = ${companyId} AND s."branchId" = ${b.id} AND s."voided" = false
              AND u."commissionPercent" IS NOT NULL
              AND s."createdAt" >= ${monthStart} AND s."createdAt" < ${end}`,
        ]);
        const cogsCents = Number(cogs[0]?.c ?? 0);
        const expensesCents = expenses._sum.amountCents ?? 0;
        const commissionsCents = Math.round(Number(commissions[0]?.c ?? 0));
        return {
          id: b.id,
          name: b.name,
          isActive: b.isActive,
          salesToday: sales._count,
          salesTodayCents: sales._sum.totalCents ?? 0,
          products,
          users,
          salesMonth: month._count,
          salesMonthCents: month._sum.totalCents ?? 0,
          lowStock: Number(low[0]?.n ?? 0),
          profitMonthCents: (month._sum.totalCents ?? 0) - cogsCents - expensesCents - commissionsCents,
          cogsMonthCents: cogsCents,
          expensesMonthCents: expensesCents,
          commissionsMonthCents: commissionsCents,
          goalCents: b.monthlyGoalCents,
        };
      })
    );
    return { summaries, currency: company?.referenceCurrency ?? "USD" };
  });
}

// Meta de ventas del mes de una sucursal (null la quita). Solo gerente.
export async function setBranchGoal(branchId: string, amount: number | null): Promise<ActionResult> {
  const { companyId } = await requireManager();
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) return { success: false, error: "Escribe una meta válida." };
  const cents = amount == null || amount === 0 ? null : Math.round(amount * 100);
  const r = await withTenant(companyId, (tx) =>
    tx.branch.updateMany({ where: { id: branchId, companyId }, data: { monthlyGoalCents: cents } })
  );
  if (r.count === 0) return { success: false, error: "Sucursal no encontrada." };
  invalidateCache(`branches:${companyId}`);
  revalidatePath("/branches");
  return { success: true };
}
