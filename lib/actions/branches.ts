"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireSession, setSessionCookie } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { bq } from "@/lib/batch-sql";
import { getOrSetCache, invalidateCache } from "@/lib/cache";
import { branchLimitError } from "@/lib/plan-limits";
import { hashPassword, verifyPassword } from "@/lib/password";
import { consumeAttempt, clearAttempts, rateLimitMessage } from "@/lib/rate-limit";
import { dayBoundsUtc, todayDateString } from "@/lib/report-types";
import { closedDayWindows } from "@/lib/closed-days";
import { Prisma } from "@prisma/client";
import type { ActionResult } from "@/lib/types";

export async function listBranches() {
  const { companyId } = await requireSession();
  // Read on every page via the root layout (for the branch switcher) —
  // branches change only when a manager adds/edits one, which invalidates
  // this key below.
  const rows = await getOrSetCache(`branches:${companyId}`, 600, () =>
    withTenant(companyId, (tx) => tx.branch.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }))
  );
  // El hash de la clave nunca sale del servidor: solo se informa si la sede tiene clave.
  // accessKeyHash se devuelve siempre null para que los tipos de Branch sigan valiendo.
  return rows.map(({ accessKeyHash, ...rest }) => ({ ...rest, accessKeyHash: null as string | null, hasKey: !!accessKeyHash }));
}

export async function branchNeedsKey(branchId: string | null): Promise<boolean> {
  const { companyId } = await requireManager();
  if (!branchId) return false;
  const b = await withTenant(companyId, (tx) => tx.branch.findFirst({ where: { id: branchId, companyId }, select: { accessKeyHash: true } }));
  return !!b?.accessKeyHash;
}

// Define o cambia la clave de 4 dígitos de una sede (null la quita).
export async function setBranchKey(branchId: string, key: string | null): Promise<ActionResult> {
  const { companyId } = await requireManager();
  if (key !== null && !/^\d{4}$/.test(key)) return { success: false, error: "La clave debe tener exactamente 4 números" };
  const r = await withTenant(companyId, (tx) =>
    tx.branch.updateMany({ where: { id: branchId, companyId }, data: { accessKeyHash: key === null ? null : hashPassword(key) } })
  );
  if (r.count === 0) return { success: false, error: "Sucursal no encontrada" };
  await invalidateCache(`branches:${companyId}`);
  revalidatePath("/branches");
  return { success: true };
}

export async function createBranch(formData: FormData): Promise<ActionResult> {
  const { companyId, plan, isSuperAdmin } = await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { success: false, error: "El nombre de la sucursal es obligatorio" };

  try {
    const limit = await withTenant(companyId, async (tx) => {
      const over = isSuperAdmin ? null : await branchLimitError(tx, companyId, plan);
      if (over) return over;
      await tx.branch.create({ data: { companyId, name } });
      return null;
    });
    if (limit) return { success: false, error: limit };
  } catch {
    return { success: false, error: "Ya existe una sucursal con ese nombre" };
  }

  await invalidateCache(`branches:${companyId}`);
  revalidatePath("/settings");
  return { success: true };
}

export async function updateBranch(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId, plan, isSuperAdmin } = await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  const isActive = formData.get("isActive") === "true";
  if (!name) return { success: false, error: "El nombre de la sucursal es obligatorio" };

  try {
    const result = await withTenant(companyId, async (tx) => {
      // Reactivar una sucursal también cuenta contra el tope del plan.
      if (isActive && !isSuperAdmin) {
        const current = await tx.branch.findFirst({ where: { id, companyId }, select: { isActive: true } });
        if (current && !current.isActive) {
          const over = await branchLimitError(tx, companyId, plan);
          if (over) return over;
        }
      }
      return tx.branch.updateMany({ where: { id, companyId }, data: { name, isActive } });
    });
    if (typeof result === "string") return { success: false, error: result };
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

  const limit = await consumeAttempt("branch-enter", session.userId, 5, 15 * 60_000);
  if (!limit.allowed) return { success: false, error: rateLimitMessage(limit.retryAfterMinutes) };

  const target = branchId
    ? await withTenant(session.companyId, (tx) =>
        tx.branch.findFirst({ where: { id: branchId, companyId: session.companyId }, select: { accessKeyHash: true } })
      )
    : null;
  if (target?.accessKeyHash) {
    // La sede tiene su propia clave de 4 dígitos: se valida contra ella.
    if (!verifyPassword(password, target.accessKeyHash)) {
      return { success: false, error: "Clave incorrecta" };
    }
    await clearAttempts("branch-enter", session.userId);
  } else {
    const user = await withTenant(session.companyId, (tx) =>
      tx.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } })
    );
    if (user?.passwordHash) {
      if (!password || !verifyPassword(password, user.passwordHash)) {
          return { success: false, error: "Clave incorrecta" };
      }
      await clearAttempts("branch-enter", session.userId);
    }
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
    const [branches, [company]] = await Promise.all([
      bq<{ id: string; name: string; isActive: boolean; monthlyGoalCents: number | null }>(tx)`
        SELECT "id", "name", "isActive", "monthlyGoalCents" FROM "Branch" WHERE "companyId" = ${companyId} ORDER BY "createdAt" ASC`,
      bq<{ referenceCurrency: string }>(tx)`SELECT "referenceCurrency"::text AS "referenceCurrency" FROM "Company" WHERE "id" = ${companyId}`,
    ]);
    const summaries = await Promise.all(
      branches.map(async (b) => {
        // Mes: solo días con cierre de caja, igual que Inicio, Estadísticas y Administración,
        // para que las cifras de la sede cuadren con las del resto del sistema.
        const monthWindows = await closedDayWindows(tx, companyId, b.id, [{ start: monthStart, end }]);
        const inMonth = (col: string) =>
          monthWindows.length === 0
            ? Prisma.sql`FALSE`
            : Prisma.sql`(${Prisma.join(monthWindows.map((w) => Prisma.sql`(${Prisma.raw(col)} >= ${w.start} AND ${Prisma.raw(col)} < ${w.end})`), " OR ")})`;
        const [salesRows, [{ products }], [{ users }], monthRows, low, cogs, expenseRows, commissions, net] = await Promise.all([
          bq<{ total: number | null; n: number }>(tx)`
            SELECT SUM("totalCents")::bigint AS total, COUNT(*)::bigint AS n FROM "Sale"
            WHERE "companyId" = ${companyId} AND "branchId" = ${b.id} AND "voided" = false AND "createdAt" >= ${start} AND "createdAt" < ${end}`,
          bq<{ products: number }>(tx)`SELECT COUNT(*)::int AS products FROM "Product" WHERE "companyId" = ${companyId} AND "branchId" = ${b.id}`,
          bq<{ users: number }>(tx)`SELECT COUNT(*)::int AS users FROM "User" WHERE "companyId" = ${companyId} AND "branchId" = ${b.id} AND "status"::text = 'ACTIVE'`,
          monthWindows.length === 0
            ? Promise.resolve([{ total: 0 as number | null, n: 0 }])
            : bq<{ total: number | null; n: number }>(tx)`
                SELECT SUM("totalCents")::bigint AS total, COUNT(*)::bigint AS n FROM "Sale"
                WHERE "companyId" = ${companyId} AND "branchId" = ${b.id} AND "voided" = false AND ${inMonth('"createdAt"')}`,
          bq<{ n: bigint }>(tx)`
            SELECT COUNT(*)::bigint AS n FROM "Product"
            WHERE "companyId" = ${companyId} AND "branchId" = ${b.id} AND "isActive" = true
              AND "trackStock" = true AND "stock" <= "lowStockThreshold"`,
          bq<{ c: bigint | null }>(tx)`
            SELECT COALESCE(SUM(si."quantity" * p."costCents"), 0)::bigint AS c
            FROM "SaleItem" si
            JOIN "Sale" s ON s.id = si."saleId"
            JOIN "Product" p ON p.id = si."productId"
            WHERE s."companyId" = ${companyId} AND s."branchId" = ${b.id} AND s."voided" = false
              AND ${inMonth('s."createdAt"')} AND p."costCents" IS NOT NULL`,
          bq<{ total: number | null }>(tx)`
            SELECT SUM("amountCents")::bigint AS total FROM "Expense"
            WHERE "companyId" = ${companyId} AND "branchId" = ${b.id} AND "spentAt" >= ${monthStart} AND "spentAt" < ${end}`,
          // Comisiones de vendedores sobre las ventas del mes en esta sede.
          bq<{ c: number | null }>(tx)`
            SELECT COALESCE(SUM(s."totalCents" * u."commissionPercent" / 100), 0)::float8 AS c
            FROM "Sale" s
            JOIN "User" u ON u.id = s."sellerId"
            WHERE s."companyId" = ${companyId} AND s."branchId" = ${b.id} AND s."voided" = false
              AND u."commissionPercent" IS NOT NULL
              AND ${inMonth('s."createdAt"')}`,
          // Ventas netas (sin IVA): la base de la utilidad, como en Administración.
          bq<{ n: bigint | null }>(tx)`
            SELECT COALESCE(SUM(si."baseCents"), 0)::bigint AS n
            FROM "SaleItem" si
            JOIN "Sale" s ON s.id = si."saleId"
            WHERE s."companyId" = ${companyId} AND s."branchId" = ${b.id} AND s."voided" = false
              AND ${inMonth('s."createdAt"')}`,
        ]);
        const sales = { _count: Number(salesRows[0]?.n ?? 0), _sum: { totalCents: Number(salesRows[0]?.total ?? 0) } };
        const month = { _count: Number(monthRows[0]?.n ?? 0), _sum: { totalCents: Number(monthRows[0]?.total ?? 0) } };
        const expenses = { _sum: { amountCents: Number(expenseRows[0]?.total ?? 0) } };
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
          profitMonthCents: Number(net[0]?.n ?? 0) - cogsCents - expensesCents - commissionsCents,
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
