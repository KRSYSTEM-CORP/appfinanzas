"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { PurchaseSchema } from "@/lib/validations";
import { decomposeTax, rateForCategory } from "@/lib/tax";
import type { ActionResult } from "@/lib/types";

export type CompletePurchaseResult =
  | { success: true; purchaseId: string }
  | { success: false; error: string };

// Receiving a purchase is the inverse of completeSale: it increases stock
// (instead of decrementing it) and updates Product.costCents to what was
// actually just paid for it — the shop's own cost basis should reflect the
// latest purchase, same way a real inventory system would.
export async function createPurchase(input: unknown): Promise<CompletePurchaseResult> {
  const session = await requireManager();
  const { companyId } = session;
  if (!session.branchId) {
    return {
      success: false,
      error: 'Selecciona una sucursal antes de registrar una compra — no se puede con "Todas las sucursales".',
    };
  }
  const branchId = session.branchId;
  const parsed = PurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { supplierId, supplierInvoiceNo, items, paymentStatus, note } = parsed.data;

  try {
    const purchaseId = await withTenant(companyId, async (tx) => {
      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, companyId } });
      if (!supplier) throw new Error("Proveedor no encontrado");

      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { ivaGeneralRatePercent: true, ivaReducedRatePercent: true, isIvaWithholdingAgent: true, ivaWithholdingPercent: true },
      });
      const ivaGeneralRatePercent = company?.ivaGeneralRatePercent ?? 16;
      const ivaReducedRatePercent = company?.ivaReducedRatePercent ?? 8;

      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) }, companyId, branchId },
      });
      const productById = new Map(products.map((p) => [p.id, p]));

      let totalCents = 0;
      let baseImponibleCents = 0;
      let taxTotalCents = 0;
      const itemsData = items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) {
          throw new Error("Uno de los productos ya no existe en esta sucursal");
        }
        const subtotalCents = item.unitCost * item.quantity;
        totalCents += subtotalCents;
        const taxRatePercent = rateForCategory(item.taxCategory, ivaGeneralRatePercent, ivaReducedRatePercent);
        const { baseCents, taxCents } = decomposeTax(subtotalCents, item.taxCategory, taxRatePercent);
        baseImponibleCents += baseCents;
        taxTotalCents += taxCents;
        return {
          productId: product.id,
          productName: product.name,
          taxCategory: item.taxCategory,
          taxRatePercent,
          unitCostCents: item.unitCost,
          quantity: item.quantity,
          baseCents,
          taxCents,
          subtotalCents,
        };
      });

      // "Contribuyente especial" companies withhold a percentage of the IVA
      // from the supplier and remit it to SENIAT directly instead — see
      // Company.isIvaWithholdingAgent.
      const ivaRetainedCents = company?.isIvaWithholdingAgent
        ? Math.round((taxTotalCents * (company.ivaWithholdingPercent ?? 75)) / 100)
        : 0;

      const previousCount = await tx.purchase.count({ where: { branchId } });

      const purchase = await tx.purchase.create({
        data: {
          companyId,
          branchId,
          supplierId,
          supplierInvoiceNo: supplierInvoiceNo ?? null,
          controlNumber: previousCount + 1,
          totalCents,
          baseImponibleCents,
          taxCents: taxTotalCents,
          ivaRetainedCents,
          paymentStatus,
          paidAt: paymentStatus === "PAID" ? new Date() : null,
          note: note ?? null,
          items: { create: itemsData },
        },
      });

      for (const item of itemsData) {
        const product = productById.get(item.productId)!;
        const newStock = product.stock + item.quantity;
        await tx.product.updateMany({
          where: { id: item.productId, companyId, branchId },
          data: {
            stock: newStock,
            costCents: item.unitCostCents,
            ...(product.stock === 0 && newStock > 0 ? { isActive: true } : {}),
          },
        });
      }

      return purchase.id;
    });

    revalidatePath("/inventory");
    revalidatePath("/purchases");
    return { success: true, purchaseId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo registrar la compra";
    return { success: false, error: message };
  }
}

async function reverseStock(tx: Prisma.TransactionClient, purchaseId: string, companyId: string, branchId: string) {
  const items = await tx.purchaseItem.findMany({ where: { purchaseId } });
  for (const item of items) {
    if (!item.productId) continue;
    const product = await tx.product.findFirst({ where: { id: item.productId, companyId, branchId } });
    if (!product) continue;
    const newStock = Math.max(0, product.stock - item.quantity);
    await tx.product.updateMany({
      where: { id: item.productId, companyId, branchId },
      data: { stock: newStock },
    });
  }
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
  return withTenant(companyId, (tx) =>
    tx.purchase.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { items: true, supplier: true },
    })
  );
}
