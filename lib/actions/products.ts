"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { ProductSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

export async function listActiveProducts() {
  const { companyId } = await requireSession();
  return prisma.product.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function listAllProducts() {
  const { companyId } = await requireSession();
  return prisma.product.findMany({
    where: { companyId },
    orderBy: { name: "asc" },
  });
}

export async function getProduct(id: string) {
  const { companyId } = await requireSession();
  return prisma.product.findFirst({ where: { id, companyId } });
}

function readProductForm(formData: FormData) {
  return ProductSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    price: formData.get("price"),
    cost: formData.get("cost") || undefined,
    stock: formData.get("stock"),
    lowStockThreshold: formData.get("lowStockThreshold"),
  });
}

export async function createProduct(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = readProductForm(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { price, cost, ...rest } = parsed.data;
  try {
    await prisma.product.create({
      data: { ...rest, priceCents: price, costCents: cost, companyId },
    });
  } catch {
    return { success: false, error: "No se pudo crear el producto (¿SKU duplicado?)" };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { success: true };
}

export async function updateProduct(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = readProductForm(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { price, cost, ...rest } = parsed.data;
  try {
    const result = await prisma.product.updateMany({
      where: { id, companyId },
      data: { ...rest, priceCents: price, costCents: cost },
    });
    if (result.count === 0) {
      return { success: false, error: "Producto no encontrado" };
    }
  } catch {
    return { success: false, error: "No se pudo actualizar el producto (¿SKU duplicado?)" };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { success: true };
}

export async function setProductActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { companyId } = await requireSession();
  await prisma.product.updateMany({ where: { id, companyId }, data: { isActive } });
  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { success: true };
}
