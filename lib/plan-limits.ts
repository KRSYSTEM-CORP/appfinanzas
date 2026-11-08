import type { Prisma } from "@prisma/client";
import { getPlan, productLimitMessage, userLimitMessage, type PlanId } from "@/lib/plans";

// Devuelve el mensaje de error si agregar `adding` productos pasaría el tope
// del plan, o null si cabe. Cuenta los productos de toda la empresa.
export async function productLimitError(
  tx: Prisma.TransactionClient,
  companyId: string,
  planId: PlanId,
  adding = 1
): Promise<string | null> {
  const plan = getPlan(planId);
  if (plan.maxProducts == null) return null;
  const count = await tx.product.count({ where: { companyId } });
  return count + adding > plan.maxProducts ? productLimitMessage(plan) : null;
}

// Cuenta al dueño más los empleados activos (desactivar a alguien libera cupo).
export async function userLimitError(
  tx: Prisma.TransactionClient,
  companyId: string,
  planId: PlanId
): Promise<string | null> {
  const plan = getPlan(planId);
  const count = await tx.user.count({ where: { companyId, status: "ACTIVE" } });
  return count + 1 > plan.maxUsers ? userLimitMessage(plan) : null;
}
