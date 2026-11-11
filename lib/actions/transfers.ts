"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { recordStockMovement } from "@/lib/stock-movements";
import { invalidateCache } from "@/lib/cache";
import type { ActionResult } from "@/lib/types";

export type TransferableProduct = { id: string; name: string; sku: string | null; stock: number };

export type TransferRow = {
  id: string;
  createdAt: Date;
  fromBranchName: string;
  toBranchName: string;
  note: string | null;
  createdByName: string;
  items: { id: string; productName: string; quantity: number }[];
};

// Productos con existencias en la sucursal de origen.
export async function listTransferableProducts(branchId: string): Promise<TransferableProduct[]> {
  const { companyId } = await requireManager();
  return withTenant(companyId, (tx) =>
    tx.product.findMany({
      where: { companyId, branchId, trackStock: true, stock: { gt: 0 } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, sku: true, stock: true },
    })
  );
}

export async function listTransfers(limit = 50): Promise<TransferRow[]> {
  const { companyId } = await requireManager();
  const rows = await withTenant(companyId, (tx) =>
    tx.branchTransfer.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { fromBranch: { select: { name: true } }, toBranch: { select: { name: true } }, items: true },
    })
  );
  return rows.map((t) => ({
    id: t.id,
    createdAt: t.createdAt,
    fromBranchName: t.fromBranch.name,
    toBranchName: t.toBranch.name,
    note: t.note,
    createdByName: t.createdByName,
    items: t.items.map((i) => ({ id: i.id, productName: i.productName, quantity: i.quantity })),
  }));
}

const TransferSchema = z.object({
  fromBranchId: z.string().min(1, "Elige la sucursal de origen"),
  toBranchId: z.string().min(1, "Elige la sucursal de destino"),
  note: z.string().trim().max(200).optional(),
  items: z
    .array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1, "La cantidad debe ser mayor a 0") }))
    .min(1, "Agrega al menos un producto")
    .max(200),
});

// Mueve mercancía de una sucursal a otra. Si el producto no existe en el destino
// (mismo SKU, o mismo nombre cuando no tiene SKU) se crea como copia con las
// existencias traspasadas. Todo ocurre en una sola transacción.
export async function createTransfer(input: unknown): Promise<ActionResult> {
  const { companyId, userId, sellerName } = await requireManager();
  const parsed = TransferSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;
  if (d.fromBranchId === d.toBranchId) {
    return { success: false, error: "El origen y el destino deben ser sucursales distintas" };
  }
  const ids = d.items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) return { success: false, error: "Un producto está repetido en el traspaso" };

  try {
    await withTenant(companyId, async (tx) => {
      const branches = await tx.branch.findMany({
        where: { companyId, id: { in: [d.fromBranchId, d.toBranchId] }, isActive: true },
        select: { id: true },
      });
      if (branches.length !== 2) throw new Error("Sucursal no encontrada o inactiva");

      const items: { productName: string; sku: string | null; quantity: number }[] = [];
      for (const line of d.items) {
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${line.productId} AND "companyId" = ${companyId} AND "branchId" = ${d.fromBranchId} FOR UPDATE`;
        const src = await tx.product.findFirst({ where: { id: line.productId, companyId, branchId: d.fromBranchId } });
        if (!src) throw new Error("Un producto ya no existe en la sucursal de origen");
        if (!src.trackStock) throw new Error(`«${src.name}» no lleva control de existencias`);
        if (src.stock < line.quantity) throw new Error(`«${src.name}»: solo hay ${src.stock} en existencia`);

        const srcAfter = src.stock - line.quantity;
        await tx.product.update({ where: { id: src.id }, data: { stock: srcAfter, isActive: srcAfter > 0 } });
        await recordStockMovement(tx, {
          companyId, branchId: d.fromBranchId, productId: src.id, productName: src.name,
          actorId: userId, actorName: sellerName, reason: "TRANSFER_OUT", sourceType: "transfer",
          quantityChange: -line.quantity, stockBefore: src.stock,
        });

        const dest = src.sku
          ? await tx.product.findUnique({ where: { branchId_sku: { branchId: d.toBranchId, sku: src.sku } } })
          : await tx.product.findFirst({ where: { companyId, branchId: d.toBranchId, sku: null, name: src.name } });
        if (dest) {
          const destAfter = dest.stock + line.quantity;
          await tx.product.update({ where: { id: dest.id }, data: { stock: destAfter, isActive: true } });
          await recordStockMovement(tx, {
            companyId, branchId: d.toBranchId, productId: dest.id, productName: dest.name,
            actorId: userId, actorName: sellerName, reason: "TRANSFER_IN", sourceType: "transfer",
            quantityChange: line.quantity, stockBefore: dest.stock,
          });
        } else {
          const created = await tx.product.create({
            data: {
              companyId,
              branchId: d.toBranchId,
              name: src.name,
              sku: src.sku,
              category: src.category,
              priceCents: src.priceCents,
              costCents: src.costCents,
              lowStockThreshold: src.lowStockThreshold,
              trackStock: true,
              isActive: true,
              imageDataUrl: src.imageDataUrl,
              priceTiersEnabled: src.priceTiersEnabled,
              wholesalePriceCents: src.wholesalePriceCents,
              wholesaleMinQty: src.wholesaleMinQty,
              bulkPriceCents: src.bulkPriceCents,
              bulkMinQty: src.bulkMinQty,
              taxCategory: src.taxCategory,
              stock: line.quantity,
            },
          });
          await recordStockMovement(tx, {
            companyId, branchId: d.toBranchId, productId: created.id, productName: created.name,
            actorId: userId, actorName: sellerName, reason: "TRANSFER_IN", sourceType: "transfer",
            quantityChange: line.quantity, stockBefore: 0,
          });
        }
        items.push({ productName: src.name, sku: src.sku, quantity: line.quantity });
      }

      await tx.branchTransfer.create({
        data: {
          companyId,
          fromBranchId: d.fromBranchId,
          toBranchId: d.toBranchId,
          note: d.note || null,
          createdById: userId,
          createdByName: sellerName,
          items: { create: items },
        },
      });
    });
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "No se pudo registrar el traspaso" };
  }

  // Mismas claves que lib/actions/products.ts (por sucursal y "todas").
  await invalidateCache(
    ...[d.fromBranchId, d.toBranchId, null].flatMap((b) => [
      `products:active:${companyId}:${b ?? "all"}`,
      `products:all:${companyId}:${b ?? "all"}`,
    ])
  );
  revalidatePath("/inventory");
  revalidatePath("/inventory/transfers");
  return { success: true };
}

export type TransferSuggestion = {
  productName: string;
  quantity: number;
  fromBranchName: string;
  toBranchName: string;
  reason: string;
};

// «KR POS te sugiere»: productos (mismo SKU, o mismo nombre sin SKU) que están en o bajo el
// mínimo en una sede mientras otra sede tiene más del doble de su mínimo.
export async function listTransferSuggestions(): Promise<TransferSuggestion[]> {
  const { companyId } = await requireManager();
  const rows = await withTenant(companyId, (tx) =>
    tx.$queryRaw<
      { name: string; qty: number; from_name: string; to_name: string; from_stock: number; to_stock: number }[]
    >`
      SELECT p_to."name" AS name,
             LEAST(p_to."lowStockThreshold" * 2 - p_to."stock", p_from."stock" - p_from."lowStockThreshold")::int AS qty,
             b_from."name" AS from_name, b_to."name" AS to_name,
             p_from."stock"::int AS from_stock, p_to."stock"::int AS to_stock
      FROM "Product" p_to
      JOIN "Product" p_from
        ON p_from."companyId" = p_to."companyId"
       AND p_from."branchId" <> p_to."branchId"
       AND ((p_to."sku" IS NOT NULL AND p_from."sku" = p_to."sku") OR (p_to."sku" IS NULL AND p_from."sku" IS NULL AND lower(p_from."name") = lower(p_to."name")))
      JOIN "Branch" b_to ON b_to.id = p_to."branchId" AND b_to."isActive" = true
      JOIN "Branch" b_from ON b_from.id = p_from."branchId" AND b_from."isActive" = true
      WHERE p_to."companyId" = ${companyId}
        AND p_to."isActive" = true AND p_from."isActive" = true
        AND p_to."trackStock" = true AND p_from."trackStock" = true
        AND p_to."stock" <= p_to."lowStockThreshold"
        AND p_from."stock" > p_from."lowStockThreshold" * 2
      ORDER BY p_to."stock" ASC
      LIMIT 5`
  );
  return rows
    .filter((r) => r.qty > 0)
    .map((r) => ({
      productName: r.name,
      quantity: r.qty,
      fromBranchName: r.from_name,
      toBranchName: r.to_name,
      reason: `${r.to_name} tiene ${r.to_stock} y ${r.from_name} ${r.from_stock}`,
    }));
}
