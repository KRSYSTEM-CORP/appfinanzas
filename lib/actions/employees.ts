"use server";

import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { hashPassword } from "@/lib/password";
import { EmployeeSchema, EmployeeUpdateSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";
import type { UserStatus } from "@prisma/client";

export async function listEmployees() {
  const { companyId } = await requireManager();
  return withTenant(companyId, (tx) =>
    tx.user.findMany({
      where: { companyId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    })
  );
}

// True if the company would still have at least one other active GERENTE
// after excluding `excludeUserId` — used to block actions that would leave a
// company with nobody able to manage it.
async function hasOtherActiveManager(
  tx: Parameters<Parameters<typeof withTenant>[1]>[0],
  companyId: string,
  excludeUserId: string
): Promise<boolean> {
  const count = await tx.user.count({
    where: { companyId, role: "GERENTE", status: "ACTIVE", id: { not: excludeUserId } },
  });
  return count > 0;
}

export async function createEmployee(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = EmployeeSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    password: formData.get("password"),
    role: formData.get("role"),
    branchId: formData.get("branchId"),
    allowedSections: formData.getAll("allowedSections"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { firstName, lastName, password, role, branchId, allowedSections } = parsed.data;

  const existing = await withTenant(companyId, (tx) =>
    tx.user.findFirst({
      where: {
        companyId,
        firstName: { equals: firstName, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
      },
    })
  );
  if (existing) {
    return { success: false, error: "Ya existe un empleado con ese nombre y apellido" };
  }

  // A GERENTE has no fixed branch (branchId stays null); a VENDEDOR's
  // branchId was already required by EmployeeSchema, but must still belong
  // to this company and be active.
  let resolvedBranchId: string | null = null;
  if (role === "VENDEDOR") {
    const branch = await withTenant(companyId, (tx) =>
      tx.branch.findFirst({ where: { id: branchId, companyId, isActive: true } })
    );
    if (!branch) return { success: false, error: "Sucursal no encontrada" };
    resolvedBranchId = branch.id;
  }

  await withTenant(companyId, (tx) =>
    tx.user.create({
      data: {
        // Employees don't have a real login email — a placeholder keeps the
        // still-globally-unique email column satisfied without ever being
        // shown or used to log in (see loginEmployee() in lib/actions/auth.ts).
        email: `empleado.${companyId}.${firstName}.${lastName}.${Date.now()}@kyra.local`.toLowerCase(),
        passwordHash: hashPassword(password),
        companyId,
        firstName,
        lastName,
        role,
        branchId: resolvedBranchId,
        status: "ACTIVE",
        allowedSections: role === "VENDEDOR" ? allowedSections : [],
      },
    })
  );

  revalidatePath("/employees");
  return { success: true };
}

export async function updateEmployee(userId: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = EmployeeUpdateSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    role: formData.get("role"),
    password: formData.get("password"),
    branchId: formData.get("branchId"),
    allowedSections: formData.getAll("allowedSections"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { firstName, lastName, role, password, branchId, allowedSections } = parsed.data;

  let resolvedBranchId: string | null = null;
  if (role === "VENDEDOR") {
    const branch = await withTenant(companyId, (tx) =>
      tx.branch.findFirst({ where: { id: branchId, companyId, isActive: true } })
    );
    if (!branch) return { success: false, error: "Sucursal no encontrada" };
    resolvedBranchId = branch.id;
  }

  const result = await withTenant(companyId, async (tx) => {
    const target = await tx.user.findFirst({ where: { id: userId, companyId } });
    if (!target) return { ok: false as const, error: "Empleado no encontrado" };

    if (target.role === "GERENTE" && role !== "GERENTE") {
      const stillHasManager = await hasOtherActiveManager(tx, companyId, userId);
      if (!stillHasManager) {
        return { ok: false as const, error: "No puedes quitarle el rol de gerente al único gerente activo" };
      }
    }

    const duplicate = await tx.user.findFirst({
      where: {
        companyId,
        id: { not: userId },
        firstName: { equals: firstName, mode: "insensitive" },
        lastName: { equals: lastName, mode: "insensitive" },
      },
    });
    if (duplicate) {
      return { ok: false as const, error: "Ya existe un empleado con ese nombre y apellido" };
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        role,
        branchId: resolvedBranchId,
        allowedSections: role === "VENDEDOR" ? allowedSections : [],
        ...(password ? { passwordHash: hashPassword(password) } : {}),
      },
    });
    return { ok: true as const };
  });

  if (!result.ok) return { success: false, error: result.error };
  revalidatePath("/employees");
  return { success: true };
}

export async function setEmployeeStatus(userId: string, status: UserStatus): Promise<ActionResult> {
  const { companyId, userId: currentUserId } = await requireManager();
  if (userId === currentUserId && status === "SUSPENDED") {
    return { success: false, error: "No puedes suspender tu propia cuenta" };
  }

  const result = await withTenant(companyId, async (tx) => {
    const target = await tx.user.findFirst({ where: { id: userId, companyId } });
    if (!target) return { ok: false as const, error: "Empleado no encontrado" };

    if (target.role === "GERENTE" && status !== "ACTIVE") {
      const stillHasManager = await hasOtherActiveManager(tx, companyId, userId);
      if (!stillHasManager) {
        return { ok: false as const, error: "No puedes suspender al único gerente activo" };
      }
    }

    await tx.user.update({ where: { id: userId }, data: { status } });
    return { ok: true as const };
  });

  if (!result.ok) return { success: false, error: result.error };
  revalidatePath("/employees");
  return { success: true };
}

export async function deleteEmployee(userId: string): Promise<ActionResult> {
  const { companyId, userId: currentUserId } = await requireManager();
  if (userId === currentUserId) {
    return { success: false, error: "No puedes eliminar tu propia cuenta" };
  }

  const result = await withTenant(companyId, async (tx) => {
    const target = await tx.user.findFirst({ where: { id: userId, companyId } });
    if (!target) return { ok: false as const, error: "Empleado no encontrado" };

    if (target.role === "GERENTE") {
      const stillHasManager = await hasOtherActiveManager(tx, companyId, userId);
      if (!stillHasManager) {
        return { ok: false as const, error: "No puedes eliminar al único gerente activo" };
      }
    }

    await tx.user.delete({ where: { id: userId } });
    return { ok: true as const };
  });

  if (!result.ok) return { success: false, error: result.error };
  revalidatePath("/employees");
  return { success: true };
}
