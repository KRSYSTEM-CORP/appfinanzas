"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import type { ActionResult } from "@/lib/types";

async function reverseStock(tx: Prisma.TransactionClient, purchaseId: string, companyId: string, branchId: string) {
  const items = await tx.purchaseItem.findMany({ where: { purchaseId } });
  const quantityByProductId = new Map<string, number>();
  for (const item of items) {
    if (!item.productId || !item.affectsStock) continue;
    quantityByProductId.set(item.productId, (quantityByProductId.get(item.productId) ?? 0) + item.quantity);
  }
  if (quantityByProductId.size === 0) return;

  const products = await tx.product.findMany({
    where: { id: { in: Array.from(quantityByProductId.keys()) }, companyId, branchId },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  await Promise.all(
    Array.from(quantityByProductId, ([productId, quantity]) => {
      const product = productById.get(productId);
      if (!product) return null;
      const newStock = Math.max(0, product.stock - quantity);
      return tx.product.updateMany({
        where: { id: productId, companyId, branchId },
        data: { stock: newStock },
      });
    })
  );
}

export async function markPurchasePaid(purchaseId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireManager();
  const result = await withTenant(companyId, (tx) =>
    tx.purchase.updateMany({
      where: {
        id: purchaseId,
        companyId,
        paymentStatus: "PENDING",
        ...(sessionBranchId ? { branchId: sessionBranchId } : {}),
      },
      data: { paymentStatus: "PAID", paidAt: new Date() },
    })
  );
  if (result.count === 0) {
    return { success: false, error: "Compra no encontrada o ya estaba pagada" };
  }
  revalidatePath("/purchases");
  return { success: true };
}

export async function voidPurchase(purchaseId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireManager();

  try {
    await withTenant(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, companyId, ...(sessionBranchId ? { branchId: sessionBranchId } : {}) },
      });
      if (!purchase) throw new Error("Compra no encontrada");
      if (purchase.voided) throw new Error("La compra ya está anulada");

      await reverseStock(tx, purchaseId, companyId, purchase.branchId);
      await tx.purchase.update({ where: { id: purchaseId }, data: { voided: true, voidedAt: new Date() } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo anular la compra";
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/purchases");
  return { success: true };
}

export async function deletePurchase(purchaseId: string): Promise<ActionResult> {
  const { companyId, branchId: sessionBranchId } = await requireManager();

  try {
    await withTenant(companyId, async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, companyId, ...(sessionBranchId ? { branchId: sessionBranchId } : {}) },
      });
      if (!purchase) throw new Error("Compra no encontrada");

      if (!purchase.voided) {
        await reverseStock(tx, purchaseId, companyId, purchase.branchId);
      }
      await tx.purchase.delete({ where: { id: purchaseId } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar la compra";
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/purchases");
  return { success: true };
}

export async function listRecentPurchases(limit = 100) {
  const { companyId, branchId } = await requireManager();
  const purchases = await withTenant(companyId, (tx) =>
    tx.purchase.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { items: true, supplier: true, payments: true },
    })
  );
  // Decimal can't cross the Server->Client Component boundary.
  return purchases.map((p) => ({
    ...p,
    payments: p.payments.map((pay) => ({
      ...pay,
      exchangeRate: pay.exchangeRate != null ? Number(pay.exchangeRate) : null,
    })),
  }));
}
