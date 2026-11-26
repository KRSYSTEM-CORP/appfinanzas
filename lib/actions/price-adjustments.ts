"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { notifyLive, posChannel } from "@/lib/realtime";
import { invalidateProductsCache } from "@/lib/products-cache";
import { userErrorMessage } from "@/lib/user-error";
import {
  canUndoAdjustment,
  increasePrice,
  increaseTriple,
  isRounding,
  parsePercentBp,
  type PriceRounding,
} from "@/lib/price-increase";

// Aumentar precios en porcentaje (solo gerente). Toca únicamente precio al detal, al mayor y al gran mayor
// (en la moneda de referencia, igual que el formulario del producto); los costos no se tocan. Cada ajuste queda
// guardado con quién, cuándo, cuánto y los precios anteriores, para poder deshacerlo durante 24 horas.

export type PriceIncreaseInput = { percent: string | number; rounding: PriceRounding; category?: string | null };
export type PriceIncreasePreview = {
  success: true;
  count: number;
  samples: { name: string; beforeCents: number; afterCents: number }[];
};
type Fail = { success: false; error: string };

type Row = { id: string; name: string; p: number; w: number | null; b: number | null };

function validate(input: PriceIncreaseInput): { bp: number; rounding: PriceRounding } | Fail {
  const bp = parsePercentBp(input.percent);
  if (bp == null) return { success: false, error: "Escribe un porcentaje entre 0,01 y 100 (puedes usar decimales)." };
  if (!isRounding(input.rounding)) return { success: false, error: "Elige cómo redondear los precios." };
  return { bp, rounding: input.rounding };
}

async function loadRows(tx: Prisma.TransactionClient, companyId: string, branchId: string | null, category: string | null, lock: boolean): Promise<Row[]> {
  const branchSql = branchId ? Prisma.sql`AND "branchId" = ${branchId}` : Prisma.empty;
  const catSql = category ? Prisma.sql`AND "category" = ${category}` : Prisma.empty;
  const lockSql = lock ? Prisma.sql`FOR UPDATE` : Prisma.empty;
  return tx.$queryRaw<Row[]>`
    SELECT "id", "name", "priceCents" AS p, "wholesalePriceCents" AS w, "bulkPriceCents" AS b
    FROM "Product"
    WHERE "companyId" = ${companyId} AND "isActive" = true ${branchSql} ${catSql}
    ORDER BY "name" ASC ${lockSql}`;
}

// Vista previa: cuántos productos cambian y 3 ejemplos (antes → después). No escribe nada.
export async function previewPriceIncrease(input: PriceIncreaseInput): Promise<PriceIncreasePreview | Fail> {
  const { companyId, branchId } = await requireManager();
  const v = validate(input);
  if ("success" in v) return v;
  const rows = await withTenant(companyId, (tx) => loadRows(tx, companyId, branchId ?? null, input.category || null, false));
  const withPrice = rows.filter((r) => r.p > 0);
  // Ejemplos repartidos (primero, medio, último) para que se vea el efecto en precios distintos.
  const pick = [0, Math.floor(withPrice.length / 2), withPrice.length - 1].filter((i, n, a) => i >= 0 && a.indexOf(i) === n);
  return {
    success: true,
    count: rows.length,
    samples: pick.slice(0, 3).map((i) => ({
      name: withPrice[i].name,
      beforeCents: withPrice[i].p,
      afterCents: increasePrice(withPrice[i].p, v.bp, v.rounding),
    })),
  };
}

export async function bulkIncreasePrices(
  input: PriceIncreaseInput & { expectedCount?: number }
): Promise<{ success: true; count: number; adjustmentId: string } | Fail> {
  const session = await requireManager();
  const { companyId, branchId, userId: actorId, sellerName: actorName } = session;
  const v = validate(input);
  if ("success" in v) return v;
  const category = input.category || null;

  try {
    const done = await withTenant(companyId, async (tx) => {
      const rows = await loadRows(tx, companyId, branchId ?? null, category, true);
      if (rows.length === 0) return { empty: true as const };
      if (input.expectedCount != null && input.expectedCount !== rows.length) return { changed: rows.length };
      const items = rows.map((r) => {
        const n = increaseTriple({ p: r.p, w: r.w, b: r.b }, v.bp, v.rounding);
        return { id: r.id, p: r.p, w: r.w, b: r.b, np: n.p, nw: n.w, nb: n.b };
      });
      const adj = await tx.priceAdjustment.create({
        data: {
          companyId,
          branchId: branchId ?? null,
          actorId,
          actorName,
          percentBp: v.bp,
          rounding: v.rounding,
          scopeCategory: category,
          productCount: rows.length,
          items,
        },
        select: { id: true },
      });
      // Un solo UPDATE agrupado para toda la empresa (o la sucursal).
      await tx.$executeRaw`
        UPDATE "Product" pr
        SET "priceCents" = x.np, "wholesalePriceCents" = x.nw, "bulkPriceCents" = x.nb, "updatedAt" = now()
        FROM jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS x(id text, p int, w int, b int, np int, nw int, nb int)
        WHERE pr."id" = x.id AND pr."companyId" = ${companyId}`;
      const branches = await tx.branch.findMany({ where: { companyId }, select: { id: true } });
      return { id: adj.id, count: rows.length, branchIds: branches.map((b) => b.id) };
    });
    if ("empty" in done) return { success: false, error: "No hay productos activos para ajustar con ese alcance." };
    if ("changed" in done) return { success: false, error: `El inventario cambió mientras revisabas: ahora son ${done.changed} productos. Vuelve a ver la vista previa.` };
    await afterPriceChange(companyId, done.branchIds);
    return { success: true, count: done.count, adjustmentId: done.id };
  } catch (err) {
    return { success: false, error: userErrorMessage(err, "No se pudieron actualizar los precios. No se cambió nada.") };
  }
}

async function afterPriceChange(companyId: string, branchIds: string[]) {
  await Promise.all([invalidateProductsCache(companyId, null), ...branchIds.map((b) => invalidateProductsCache(companyId, b))]);
  revalidatePath("/inventory");
  revalidatePath("/pos");
  // El POS (también sin internet) vuelve a bajar el catálogo con los precios nuevos.
  void notifyLive(posChannel(companyId), "product");
}

export type LastPriceAdjustment = {
  id: string;
  createdAt: string;
  actorName: string;
  percentBp: number;
  rounding: string;
  scopeCategory: string | null;
  productCount: number;
  canUndo: boolean;
  undoneAt: string | null;
};

export async function getLastPriceAdjustment(): Promise<LastPriceAdjustment | null> {
  const { companyId } = await requireManager();
  const a = await withTenant(companyId, (tx) =>
    tx.priceAdjustment.findFirst({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      omit: { items: true },
    })
  );
  if (!a) return null;
  return {
    id: a.id,
    createdAt: a.createdAt.toISOString(),
    actorName: a.actorName,
    percentBp: a.percentBp,
    rounding: a.rounding,
    scopeCategory: a.scopeCategory,
    productCount: a.productCount,
    canUndo: canUndoAdjustment(a),
    undoneAt: a.undoneAt?.toISOString() ?? null,
  };
}

// Deshace el ÚLTIMO ajuste (si tiene menos de 24 h y no se deshizo ya). Solo vuelven a su precio anterior los
// productos cuyos precios siguen siendo los del ajuste: si alguien editó uno a mano, ese no se toca.
export async function undoLastPriceAdjustment(): Promise<{ success: true; restored: number; skipped: number } | Fail> {
  const { companyId, sellerName } = await requireManager();
  try {
    const out = await withTenant(companyId, async (tx) => {
      const last = await tx.priceAdjustment.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" } });
      if (!last || last.undoneAt) return { error: "No hay ningún ajuste de precios para deshacer." };
      if (!canUndoAdjustment(last)) return { error: "Ya pasaron más de 24 horas: este ajuste ya no se puede deshacer." };
      const items = last.items as { id: string }[];
      const restored = await tx.$executeRaw`
        UPDATE "Product" pr
        SET "priceCents" = x.p, "wholesalePriceCents" = x.w, "bulkPriceCents" = x.b, "updatedAt" = now()
        FROM jsonb_to_recordset(${JSON.stringify(last.items)}::jsonb) AS x(id text, p int, w int, b int, np int, nw int, nb int)
        WHERE pr."id" = x.id AND pr."companyId" = ${companyId}
          AND pr."priceCents" = x.np
          AND pr."wholesalePriceCents" IS NOT DISTINCT FROM x.nw
          AND pr."bulkPriceCents" IS NOT DISTINCT FROM x.nb`;
      if (restored === 0) return { error: "Esos precios ya se editaron después del ajuste, así que no hay nada que deshacer." };
      await tx.priceAdjustment.update({ where: { id: last.id }, data: { undoneAt: new Date(), undoneByName: sellerName } });
      const branches = await tx.branch.findMany({ where: { companyId }, select: { id: true } });
      return { restored, skipped: items.length - restored, branchIds: branches.map((b) => b.id) };
    });
    if ("error" in out) return { success: false, error: out.error as string };
    await afterPriceChange(companyId, out.branchIds);
    return { success: true, restored: out.restored, skipped: out.skipped };
  } catch (err) {
    return { success: false, error: userErrorMessage(err, "No se pudo deshacer el ajuste.") };
  }
}
