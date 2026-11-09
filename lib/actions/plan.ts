"use server";

import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { getPlan, type PlanDef } from "@/lib/plans";
import { getAssistantStatus } from "@/lib/actions/assistant";

export type PlanUsage = {
  plan: PlanDef;
  usedUsers: number;
  usedProducts: number;
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
      const [users, products] = await Promise.all([
        tx.user.count({ where: { companyId, status: "ACTIVE" } }),
        tx.product.count({ where: { companyId } }),
      ]);
      return { users, products };
    }),
    getAssistantStatus(),
  ]);
  return {
    plan: getPlan(session.plan),
    usedUsers: counts.users,
    usedProducts: counts.products,
    creditsLeft: status.creditsLeft,
    nextPaymentDueDate: session.nextPaymentDueDate,
    isExempt: session.isExempt,
  };
}
