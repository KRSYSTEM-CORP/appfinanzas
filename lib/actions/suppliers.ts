"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { SupplierSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

export async function listSuppliers(activeOnly = false) {
  const { companyId } = await requireManager();
  return withTenant(companyId, (tx) =>
    tx.supplier.findMany({
      where: { companyId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: { name: "asc" },
    })
  );
}

export async function getSupplier(id: string) {
  const { companyId } = await requireManager();
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
  const { companyId } = await requireManager();
  const parsed = readSupplierForm(formData);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await withTenant(companyId, (tx) => tx.supplier.create({ data: { ...parsed.data, companyId } }));

  revalidatePath("/suppliers");
  return { success: true };
}

export async function updateSupplier(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
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

export async function setSupplierActive(id: string, isActive: boolean): Promise<ActionResult> {
  const { companyId } = await requireManager();
  await withTenant(companyId, (tx) => tx.supplier.updateMany({ where: { id, companyId }, data: { isActive } }));
  revalidatePath("/suppliers");
  return { success: true };
}

// A supplier with existing Purchase history can't be deleted (Purchase.
// supplierId is ON DELETE RESTRICT, same reasoning as Product having no such
// restriction — but here we DO want to keep the supplier record intact for
// the Libro de Compras report) — deactivate it instead so it disappears from
// new-purchase pickers while past purchases keep their supplier reference.
export async function deleteSupplier(id: string): Promise<ActionResult> {
  const { companyId } = await requireManager();
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
