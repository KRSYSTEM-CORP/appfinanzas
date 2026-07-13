"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { SaleSchema, type SaleInput } from "@/lib/validations";

export type CompleteSaleResult =
  | { success: true; saleId: string }
  | { success: false; error: string };

export async function completeSale(input: SaleInput): Promise<CompleteSaleResult> {
  const { companyId } = await requireSession();
  const parsed = SaleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Carrito inválido" };
  }
  const { items, paymentMethod } = parsed.data;

  try {
    const saleId = await prisma.$transaction(async (tx) => {
      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) }, companyId },
      });
      const productById = new Map(products.map((p) => [p.id, p]));

      let totalCents = 0;
      const itemsData = items.map((item) => {
        const product = productById.get(item.productId);
        if (!product) {
          throw new Error("Uno de los productos ya no existe");
        }
        if (product.stock < item.quantity) {
          throw new Error(
            `Stock insuficiente para "${product.name}" (disponible: ${product.stock})`
          );
        }
        const subtotalCents = product.priceCents * item.quantity;
        totalCents += subtotalCents;
        return {
          productId: product.id,
          productName: product.name,
          unitPriceCents: product.priceCents,
          quantity: item.quantity,
          subtotalCents,
        };
      });

      const sale = await tx.sale.create({
        data: {
          totalCents,
          paymentMethod,
          companyId,
          items: { create: itemsData },
        },
      });

      for (const item of itemsData) {
        await tx.product.updateMany({
          where: { id: item.productId, companyId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      return sale.id;
    });

    revalidatePath("/inventory");
    revalidatePath("/pos");
    revalidatePath("/reports");
    return { success: true, saleId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo completar la venta";
    return { success: false, error: message };
  }
}

export async function getSaleReceipt(saleId: string) {
  const { companyId } = await requireSession();
  return prisma.sale.findFirst({
    where: { id: saleId, companyId },
    include: { items: true },
  });
}

export async function listRecentSales(limit = 10) {
  const { companyId } = await requireSession();
  return prisma.sale.findMany({
    where: { companyId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { items: true },
  });
}
