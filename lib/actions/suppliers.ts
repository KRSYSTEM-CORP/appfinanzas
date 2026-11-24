"use server";

import { revalidatePath } from "next/cache";
import { requirePurchasesAccess } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { SupplierSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

export async function listSuppliers(activeOnly = false) {
  const { companyId } = await requirePurchasesAccess();
  return withTenant(companyId, (tx) =>
    tx.supplier.findMany({
      where: { companyId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: "asc" },
      take: 200,
    })
  );
}

export async function getSupplier(id: string) {
  const { companyId } = await requirePurchasesAccess();
  return withTenant(companyId, (tx) => tx.supplier.findFirst({ where: { id, companyId } }));
}

function readSupplierForm(formData: FormData) {
  return SupplierSchema.safeParse({
    name: formData.get("name"),
    rif: formData.get("rif"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    email: formData.get("email"),
  });
}

export async function createSupplier(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requirePurchasesAccess();
  const parsed = readSupplierForm(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  try {
    const dup = await withTenant(companyId, (tx) =>
      tx.supplier.findFirst({ where: { companyId, name: { equals: parsed.data.name, mode: "insensitive" } }, select: { id: true } })
    );
    if (dup) return { success: false, error: "Ya tienes un proveedor con ese nombre" };
    await withTenant(companyId, (tx) => tx.supplier.create({ data: { ...parsed.data, companyId } }));
  } catch {
    return { success: false, error: "No se pudo crear el proveedor" };
  }

  revalidatePath("/suppliers");
  return { success: true };
}

export async function updateSupplier(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requirePurchasesAccess();
  const parsed = readSupplierForm(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const result = await withTenant(companyId, (tx) =>
    tx.supplier.updateMany({ where: { id, companyId }, data: parsed.data })
  );
  if (result.count === 0) {
    return { success: false, error: "Proveedor no encontrado" };
  }

  revalidatePath("/suppliers");
  return { success: true };
}

export async function setSupplierRating(id: string, rating: number | null): Promise<ActionResult> {
  const { companyId } = await requirePurchasesAccess();
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return { success: false, error: "La calificación va de 1 a 5" };
  }
  const r = await withTenant(companyId, (tx) => tx.supplier.updateMany({ where: { id, companyId }, data: { rating } }));
  if (r.count === 0) return { success: false, error: "Proveedor no encontrado" };
  revalidatePath("/suppliers");
  return { success: true };
}

export async function setSupplierActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { companyId } = await requirePurchasesAccess();
  const r = await withTenant(companyId, (tx) => tx.supplier.updateMany({ where: { id, companyId }, data: { isActive } }));
  if (r.count === 0) return { success: false, error: "Proveedor no encontrado" };
  revalidatePath("/suppliers");
  return { success: true };
}

// A supplier with existing Purchase history can't be deleted (Purchase.
// supplierId is ON DELETE RESTRICT, same reasoning as Product having no such
// restriction — but here we DO want to keep the supplier record intact for
// the Libro de Compras report) — deactivate it instead so it disappears from
// new-purchase pickers while past purchases keep their supplier reference.
export async function deleteSupplier(id: string): Promise<ActionResult> {
  const { companyId } = await requirePurchasesAccess();
  try {
    const result = await withTenant(companyId, (tx) => tx.supplier.deleteMany({ where: { id, companyId } }));
    if (result.count === 0) {
      return { success: false, error: "Proveedor no encontrado" };
    }
  } catch {
    return {
      success: false,
      error: "Este proveedor tiene compras registradas — desactívalo en vez de eliminarlo.",
    };
  }
  revalidatePath("/suppliers");
  return { success: true };
}
