"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { CustomerRecordSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

export async function listCustomers(query?: string) {
  const { companyId } = await requireSession();
  const q = query?.trim();
  return prisma.customer.findMany({
    where: {
      companyId,
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { firstName: "asc" },
  });
}

export async function searchCustomers(query: string) {
  const { companyId } = await requireSession();
  const q = query.trim();
  if (!q) return [];
  return prisma.customer.findMany({
    where: {
      companyId,
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { firstName: "asc" },
    take: 5,
  });
}

export async function findCustomerByPhone(phone: string) {
  const { companyId } = await requireSession();
  const p = phone.trim();
  if (!p) return null;
  return prisma.customer.findUnique({
    where: { companyId_phone: { companyId, phone: p } },
  });
}

export async function getCustomer(id: string) {
  const { companyId } = await requireSession();
  return prisma.customer.findFirst({ where: { id, companyId } });
}

function readCustomerForm(formData: FormData) {
  return CustomerRecordSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    address: formData.get("address"),
  });
}

export async function createCustomer(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = readCustomerForm(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    await prisma.customer.create({ data: { ...parsed.data, companyId } });
  } catch {
    return { success: false, error: "Ya existe un cliente con ese teléfono" };
  }

  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomer(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireSession();
  const parsed = readCustomerForm(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    const result = await prisma.customer.updateMany({
      where: { id, companyId },
      data: parsed.data,
    });
    if (result.count === 0) {
      return { success: false, error: "Cliente no encontrado" };
    }
  } catch {
    return { success: false, error: "Ya existe un cliente con ese teléfono" };
  }

  revalidatePath("/customers");
  return { success: true };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const { companyId } = await requireSession();
  await prisma.customer.deleteMany({ where: { id, companyId } });
  revalidatePath("/customers");
  return { success: true };
}
