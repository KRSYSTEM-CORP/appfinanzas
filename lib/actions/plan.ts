"use server";

import { getSession, requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { getPlan, PLANS, type PlanDef, type PlanId } from "@/lib/plans";
import { getAssistantStatus } from "@/lib/actions/assistant";

export type PlanUsage = {
  plan: PlanDef;
  usedUsers: number;
  usedProducts: number;
  usedBranches: number;
  companyName: string;
  lastReport: { status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: Date } | null;
  creditsLeft: number;
  nextPaymentDueDate: Date | null;
  isExempt: boolean;
};

// Resumen de «Mi plan»: plan actual y cuánto de cada límite se está usando. Los
// conteos son los mismos que usa lib/plan-limits.ts para bloquear al llegar al tope.
export async function getPlanUsage(): Promise<PlanUsage> {
  const session = await requireManager();
  const { companyId } = session;
  const [counts, status] = await Promise.all([
    withTenant(companyId, async (tx) => {
      const [users, products, branches, report] = await Promise.all([
        tx.user.count({ where: { companyId, status: "ACTIVE" } }),
        tx.product.count({ where: { companyId } }),
        tx.branch.count({ where: { companyId, isActive: true } }),
        tx.paymentReport.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } }),
      ]);
      return { users, products, branches, report };
    }),
    getAssistantStatus(),
  ]);
  return {
    plan: getPlan(session.plan),
    usedUsers: counts.users,
    usedProducts: counts.products,
    usedBranches: counts.branches,
    companyName: session.companyName,
    lastReport: counts.report,
    creditsLeft: status.creditsLeft,
    nextPaymentDueDate: session.nextPaymentDueDate,
    isExempt: session.isExempt,
  };
}

// Primera elección de plan al crear la cuenta (pantalla /choose-plan). No cobra
// nada: los 15 días gratis siguen corriendo y el pago se hace al terminar.
export async function chooseInitialPlan(plan: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== "GERENTE") return { success: false, error: "No tienes permiso para elegir el plan." };
  if (!session.needsPlanChoice) return { success: false, error: "Ya elegiste tu plan. Para cambiarlo escríbenos por soporte." };
  if (!(plan in PLANS)) return { success: false, error: "Elige un plan válido." };
  const def = PLANS[plan as PlanId];
  await withTenant(session.companyId, (tx) =>
    tx.company.update({
      where: { id: session.companyId },
      data: { plan: def.id, monthlyFeeUsdCents: def.priceUsdCents, planChosen: true },
    })
  );
  return { success: true };
}
