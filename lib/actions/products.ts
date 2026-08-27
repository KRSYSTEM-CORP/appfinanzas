"use server";

import { revalidatePath } from "next/cache";
import { requireManager, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { notifyLive, posChannel } from "@/lib/realtime";
import { ProductSchema, ProductUpdateRowSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";
import type { Prisma } from "@prisma/client";

export async function listActiveProducts() {
  const { companyId, branchId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.product.findMany({
      where: { companyId, isActive: true, ...(branchId ? { branchId } : {}) },
      orderBy: { name: "asc" },
    })
  );
}

export async function listAllProducts() {
  const { companyId, branchId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.product.findMany({
      where: { companyId, ...(branchId ? { branchId } : {}) },
      orderBy: { name: "asc" },
    })
  );
}

export async function getProduct(id: string) {
  const { companyId, branchId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.product.findFirst({ where: { id, companyId, ...(branchId ? { branchId } : {}) } })
  );
}

function readProductForm(formData: FormData) {
  return ProductSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    category: formData.get("category"),
    price: formData.get("price"),
    cost: formData.get("cost") || undefined,
    trackStock: formData.get("trackStock") ?? undefined,
    stock: formData.get("stock") || undefined,
    lowStockThreshold: formData.get("lowStockThreshold"),
    taxCategory: formData.get("taxCategory") || undefined,
    image: formData.get("image") || undefined,
    priceTiersEnabled: formData.get("priceTiersEnabled") ?? undefined,
    wholesalePrice: formData.get("wholesalePrice") || undefined,
    wholesaleMinQty: formData.get("wholesaleMinQty") || undefined,
    bulkPrice: formData.get("bulkPrice") || undefined,
    bulkMinQty: formData.get("bulkMinQty") || undefined,
  });
}

export async function listCategories(): Promise<string[]> {
  const { companyId } = await requireSession();
  const rows = await withTenant(companyId, (tx) =>
    tx.product.findMany({
      where: { companyId, category: { not: null } },
      select: { category: true },
      distinct: ["category"],
      orderBy: { category: "asc" },
    })
  );
  return rows.map((r) => r.category).filter((c): c is string => !!c);
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const session = await requireManager();
  const { companyId } = session;
  if (!session.branchId) {
    return { success: false, error: 'Selecciona una sucursal antes de crear un producto — no se puede con "Todas las sucursales".' };
  }
  const branchId = session.branchId;
  const parsed = readProductForm(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { price, cost, image, stock, trackStock, wholesalePrice, bulkPrice, ...rest } = parsed.data;
  const resolvedStock = trackStock ? (stock ?? 0) : 0;
  try {
    await withTenant(companyId, (tx) =>
      tx.product.create({
        data: {
          ...rest,
          priceCents: price,
          costCents: cost,
          imageDataUrl: image ?? null,
          companyId,
          branchId,
          trackStock,
          stock: resolvedStock,
          wholesalePriceCents: wholesalePrice,
          bulkPriceCents: bulkPrice,
          // Without stock tracking there's no zero-stock signal to gate on —
          // the product is simply always available.
          isActive: trackStock ? resolvedStock > 0 : true,
        },
      })
    );
  } catch {
    return { success: false, error: "No se pudo crear el producto (¿SKU duplicado?)" };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  void notifyLive(posChannel(companyId), "product");
  return { success: true };
}

export async function updateProduct(id: string, formData: FormData): Promise<ActionResult> {
  const session = await requireManager();
  const { companyId } = session;
  if (!session.branchId) {
    return { success: false, error: 'Selecciona una sucursal antes de editar un producto — no se puede con "Todas las sucursales".' };
  }
  const branchId = session.branchId;
  const parsed = readProductForm(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { price, cost, image, stock, trackStock, wholesalePrice, bulkPrice, ...rest } = parsed.data;

  try {
    const result = await withTenant(companyId, async (tx) => {
      const existing = await tx.product.findFirst({ where: { id, companyId, branchId } });
      if (!existing) return null;

      const resolvedStock = trackStock ? (stock ?? 0) : existing.stock;
      // Stock is the source of truth for availability: reaching 0 always
      // deactivates, and manually entering stock for a previously
      // out-of-stock product reactivates it. An unrelated edit that leaves
      // stock untouched (and > 0) doesn't override a deliberate manual
      // deactivation. None of this applies once stock tracking is off — the
      // product just stays whatever isActive it already was.
      const isActive = !trackStock
        ? existing.isActive
        : resolvedStock === 0
          ? false
          : existing.stock === 0
            ? true
            : existing.isActive;

      return tx.product.updateMany({
        where: { id, companyId, branchId },
        data: {
          ...rest,
          priceCents: price,
          costCents: cost,
          imageDataUrl: image ?? null,
          trackStock,
          stock: resolvedStock,
          wholesalePriceCents: wholesalePrice,
          bulkPriceCents: bulkPrice,
          isActive,
        },
      });
    });
    if (!result || result.count === 0) {
      return { success: false, error: "Producto no encontrado" };
    }
  } catch {
    return { success: false, error: "No se pudo actualizar el producto (¿SKU duplicado?)" };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  void notifyLive(posChannel(companyId), "product");
  return { success: true };
}

export async function setProductActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { companyId, branchId } = await requireManager();
  await withTenant(companyId, (tx) =>
    tx.product.updateMany({ where: { id, companyId, ...(branchId ? { branchId } : {}) }, data: { isActive } })
  );
  revalidatePath("/inventory");
  revalidatePath("/pos");
  void notifyLive(posChannel(companyId), "product");
  return { success: true };
}

// Permanently removes a product. Past sales/quotes keep their own
// snapshotted name/price (SaleItem/QuoteItem.productId is onDelete: SetNull),
// so historical documents and reports are unaffected — only the catalog
// entry itself and its availability in POS/Presupuestos disappear.
export async function deleteProduct(id: string): Promise<ActionResult> {
  const { companyId, branchId } = await requireManager();
  const result = await withTenant(companyId, (tx) =>
    tx.product.deleteMany({ where: { id, companyId, ...(branchId ? { branchId } : {}) } })
  );
  if (result.count === 0) {
    return { success: false, error: "Producto no encontrado" };
  }
  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/quotes");
  void notifyLive(posChannel(companyId), "product");
  return { success: true };
}

export type BulkImportRow = {
  name: unknown;
  sku?: unknown;
  category?: unknown;
  price: unknown;
  cost?: unknown;
  trackStock?: unknown;
  stock?: unknown;
  lowStockThreshold?: unknown;
  taxCategory?: unknown;
  priceTiersEnabled?: unknown;
  wholesalePrice?: unknown;
  wholesaleMinQty?: unknown;
  bulkPrice?: unknown;
  bulkMinQty?: unknown;
};

export type BulkImportResult = {
  created: number;
  updated: number;
  failed: { row: number; error: string }[];
};

// Rows arrive already parsed from an Excel file on the client — never trust
// them: run every row through the exact same ProductSchema used by the manual
// product form. A product whose SKU already exists in this company gets its
// stock/price/etc. reconciled (updated) instead of creating a duplicate.
export async function bulkImportProducts(rows: BulkImportRow[]): Promise<BulkImportResult> {
  const session = await requireManager();
  const { companyId } = session;
  if (!session.branchId) {
    return {
      created: 0,
      updated: 0,
      failed: [{ row: 0, error: 'Selecciona una sucursal antes de importar — no se puede con "Todas las sucursales".' }],
    };
  }
  const branchId = session.branchId;
  let created = 0;
  let updated = 0;
  const failed: { row: number; error: string }[] = [];

  await withTenant(companyId, async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const parsed = ProductSchema.safeParse(rows[i]);
      if (!parsed.success) {
        failed.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
        continue;
      }

      const { price, cost, stock, trackStock, wholesalePrice, bulkPrice, ...rest } = parsed.data;
      const resolvedStock = trackStock ? (stock ?? 0) : 0;
      const isActive = trackStock ? resolvedStock > 0 : true;
      const priceFields = {
        priceCents: price,
        costCents: cost,
        trackStock,
        stock: resolvedStock,
        wholesalePriceCents: wholesalePrice,
        bulkPriceCents: bulkPrice,
        isActive,
      };

      try {
        const existing = rest.sku
          ? await tx.product.findUnique({
              where: { branchId_sku: { branchId, sku: rest.sku } },
            })
          : null;

        if (existing) {
          await tx.product.update({
            where: { id: existing.id },
            data: { ...rest, ...priceFields },
          });
          updated++;
        } else {
          await tx.product.create({
            data: { ...rest, ...priceFields, companyId, branchId },
          });
          created++;
        }
      } catch {
        failed.push({ row: i + 1, error: "No se pudo guardar (¿SKU duplicado?)" });
      }
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/pos");
  void notifyLive(posChannel(companyId), "product");
  return { created, updated, failed };
}

export type BulkUpdateRow = {
  id: unknown;
  sku?: unknown;
  name?: unknown;
  category?: unknown;
  price?: unknown;
  cost?: unknown;
  trackStock?: unknown;
  stock?: unknown;
  lowStockThreshold?: unknown;
  taxCategory?: unknown;
  priceTiersEnabled?: unknown;
  wholesalePrice?: unknown;
  wholesaleMinQty?: unknown;
  bulkPrice?: unknown;
  bulkMinQty?: unknown;
};

export type BulkUpdateResult = {
  updated: number;
  notFound: { row: number; label: string }[];
  failed: { row: number; error: string }[];
};

// Unlike bulkImportProducts, this never creates a product — every row must
// match an existing product (by its internal id, see ProductUpdateRowSchema),
// and only the columns actually filled in on that row get changed (see
// ProductUpdateRowSchema's blank-means-unchanged semantics). Meant for
// mass-editing price/stock/etc. on an inventory export, not for adding new
// products.
export async function bulkUpdateProducts(rows: BulkUpdateRow[]): Promise<BulkUpdateResult> {
  const session = await requireManager();
  const { companyId } = session;
  if (!session.branchId) {
    return {
      updated: 0,
      notFound: [],
      failed: [{ row: 0, error: 'Selecciona una sucursal antes de actualizar — no se puede con "Todas las sucursales".' }],
    };
  }
  const branchId = session.branchId;
  let updated = 0;
  const notFound: { row: number; label: string }[] = [];
  const failed: { row: number; error: string }[] = [];

  await withTenant(companyId, async (tx) => {
    for (let i = 0; i < rows.length; i++) {
      const parsed = ProductUpdateRowSchema.safeParse(rows[i]);
      if (!parsed.success) {
        failed.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "Datos inválidos" });
        continue;
      }

      const {
        id,
        sku,
        name,
        category,
        price,
        cost,
        trackStock,
        stock,
        lowStockThreshold,
        taxCategory,
        priceTiersEnabled,
        wholesalePrice,
        wholesaleMinQty,
        bulkPrice,
        bulkMinQty,
      } = parsed.data;
      const existing = await tx.product.findFirst({ where: { id, companyId, branchId } });
      if (!existing) {
        notFound.push({ row: i + 1, label: name ?? sku ?? id });
        continue;
      }

      const data: Prisma.ProductUpdateInput = {};
      if (sku !== undefined) data.sku = sku;
      if (name !== undefined) data.name = name;
      if (category !== undefined) data.category = category;
      if (price !== undefined) data.priceCents = price;
      if (cost !== undefined) data.costCents = cost;
      if (trackStock !== undefined) data.trackStock = trackStock;
      if (stock !== undefined) {
        data.stock = stock;
        // Only auto-toggle from the stock count when this product actually
        // tracks stock (using whatever trackStock ends up being after this
        // same row's own edit, if it also changed it).
        const effectiveTrackStock = trackStock ?? existing.trackStock;
        if (effectiveTrackStock) data.isActive = stock > 0;
      }
      if (lowStockThreshold !== undefined) data.lowStockThreshold = lowStockThreshold;
      if (taxCategory !== undefined) data.taxCategory = taxCategory;
      if (priceTiersEnabled !== undefined) data.priceTiersEnabled = priceTiersEnabled;
      if (wholesalePrice !== undefined) data.wholesalePriceCents = wholesalePrice;
      if (wholesaleMinQty !== undefined) data.wholesaleMinQty = wholesaleMinQty;
      if (bulkPrice !== undefined) data.bulkPriceCents = bulkPrice;
      if (bulkMinQty !== undefined) data.bulkMinQty = bulkMinQty;

      try {
        await tx.product.update({ where: { id: existing.id }, data });
        updated++;
      } catch {
        failed.push({ row: i + 1, error: "No se pudo actualizar (¿SKU duplicado?)" });
      }
    }
  });

  revalidatePath("/inventory");
  revalidatePath("/pos");
  void notifyLive(posChannel(companyId), "product");
  return { updated, notFound, failed };
}
