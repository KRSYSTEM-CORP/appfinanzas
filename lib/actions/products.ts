"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ProductSchema } from "@/lib/validations";

export async function listActiveProducts() {
  return prisma.product.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
}

export async function listAllProducts() {
  return prisma.product.findMany({
    orderBy: { name: "asc" },
  });
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({ where: { id } });
}

export type ActionResult = { success: true } | { success: false; error: string };

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
  const parsed = readProductForm(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { price, cost, ...rest } = parsed.data;
  try {
    await prisma.product.create({
      data: { ...rest, priceCents: price, costCents: cost },
    });
  } catch {
    return { success: false, error: "No se pudo crear el producto (¿SKU duplicado?)" };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { success: true };
}

export async function updateProduct(id: string, formData: FormData): Promise<ActionResult> {
  const parsed = readProductForm(formData);

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { price, cost, ...rest } = parsed.data;
  try {
    await prisma.product.update({
      where: { id },
      data: { ...rest, priceCents: price, costCents: cost },
    });
  } catch {
    return { success: false, error: "No se pudo actualizar el producto (¿SKU duplicado?)" };
  }

  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { success: true };
}

export async function setProductActive(id: string, isActive: boolean): Promise<ActionResult> {
  await prisma.product.update({ where: { id }, data: { isActive } });
  revalidatePath("/inventory");
  revalidatePath("/pos");
  return { success: true };
}
