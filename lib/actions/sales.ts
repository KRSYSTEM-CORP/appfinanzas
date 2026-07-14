"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { SaleSchema, RegisterPaymentSchema, type SaleInput } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

export type CompleteSaleResult =
  | { success: true; saleId: string }
  | { success: false; error: string };

export async function completeSale(input: SaleInput): Promise<CompleteSaleResult> {
  const { companyId } = await requireSession();
  const parsed = SaleSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Carrito inválido" };
  }
  const {
    items,
    paymentMethod,
    paymentStatus,
    paidInForeignCurrency,
    paymentReference,
    customerFirstName,
    customerLastName,
    customerPhone,
    customerAddress,
  } = parsed.data;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { exchangeRate: true },
  });
  if (company?.exchangeRate == null) {
    return {
      success: false,
      error: "Configura la tasa de cambio antes de completar una venta.",
    };
  }
  const exchangeRate = company.exchangeRate;

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

      const customer = await tx.customer.upsert({
        where: { companyId_phone: { companyId, phone: customerPhone } },
        create: {
          companyId,
          firstName: customerFirstName,
          lastName: customerLastName,
          phone: customerPhone,
          address: customerAddress,
        },
        update: {
          firstName: customerFirstName,
          lastName: customerLastName,
          address: customerAddress,
        },
      });

      const isPaid = paymentStatus === "PAID";
      const previousCount = await tx.sale.count({ where: { companyId } });

      const sale = await tx.sale.create({
        data: {
          totalCents,
          paymentMethod: isPaid ? paymentMethod : null,
          paymentStatus,
          paidAt: isPaid ? new Date() : null,
          paidInForeignCurrency,
          paymentReference: isPaid ? paymentReference : null,
          customerFirstName,
          customerLastName,
          customerPhone,
          customerAddress,
          customerId: customer.id,
          companyId,
          exchangeRate,
          controlNumber: previousCount + 1,
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
    revalidatePath("/customers");
    return { success: true, saleId };
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo completar la venta";
    return { success: false, error: message };
  }
}

async function restoreStock(tx: Prisma.TransactionClient, saleId: string, companyId: string) {
  const items = await tx.saleItem.findMany({ where: { saleId } });
  for (const item of items) {
    if (!item.productId) continue;
    await tx.product.updateMany({
      where: { id: item.productId, companyId },
      data: { stock: { increment: item.quantity } },
    });
  }
}

export async function voidSale(saleId: string): Promise<ActionResult> {
  const { companyId } = await requireSession();

  try {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, companyId } });
      if (!sale) throw new Error("Venta no encontrada");
      if (sale.voided) throw new Error("La venta ya está anulada");

      await restoreStock(tx, saleId, companyId);
      await tx.sale.update({ where: { id: saleId }, data: { voided: true, voidedAt: new Date() } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo anular la venta";
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/reports");
  return { success: true };
}

export async function deleteSale(saleId: string): Promise<ActionResult> {
  const { companyId } = await requireSession();

  try {
    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id: saleId, companyId } });
      if (!sale) throw new Error("Venta no encontrada");

      if (!sale.voided) {
        await restoreStock(tx, saleId, companyId);
      }
      await tx.sale.delete({ where: { id: saleId } });
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar la venta";
    return { success: false, error: message };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  revalidatePath("/reports");
  return { success: true };
}

export async function registerPayment(
  saleId: string,
  input: { paymentMethod: string; paymentReference?: string }
): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = RegisterPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { exchangeRate: true },
  });

  const result = await prisma.sale.updateMany({
    where: { id: saleId, companyId, paymentStatus: "CREDIT" },
    data: {
      paymentStatus: "PAID",
      paidAt: new Date(),
      paymentMethod: parsed.data.paymentMethod,
      paymentReference: parsed.data.paymentReference,
      paidExchangeRate: company?.exchangeRate ?? null,
    },
  });
  if (result.count === 0) {
    return { success: false, error: "Venta no encontrada o ya estaba pagada" };
  }

  revalidatePath("/reports");
  return { success: true };
}

export async function getSaleReceipt(saleId: string) {
  const { companyId } = await requireSession();
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, companyId },
    include: { items: true },
  });
  if (!sale) return null;
  // Client Components can't receive Prisma's Decimal instances across the
  // server action boundary — convert to a plain number first.
  return {
    ...sale,
    exchangeRate: sale.exchangeRate != null ? Number(sale.exchangeRate) : null,
    paidExchangeRate: sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
  };
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
