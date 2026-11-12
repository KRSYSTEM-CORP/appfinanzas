"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { ALL_PERMISSIONS, DEFAULT_LOCK_MINUTES, DEFAULT_ROLES, LOCK_MINUTE_CHOICES } from "@/lib/permissions";
import type { ActionResult } from "@/lib/types";

export type RoleRow = {
  id: string;
  name: string;
  baseRole: "GERENTE" | "VENDEDOR";
  permissions: string[];
  lockMinutes: number;
  isSystem: boolean;
  users: number;
};

// Crea los roles por defecto de la empresa la primera vez que se piden.
async function ensureDefaultRoles(tx: Parameters<Parameters<typeof withTenant>[1]>[0], companyId: string) {
  const count = await tx.companyRole.count({ where: { companyId } });
  if (count > 0) return;
  await tx.companyRole.createMany({
    data: DEFAULT_ROLES.map((r) => ({ companyId, name: r.name, baseRole: r.baseRole, permissions: r.permissions, isSystem: true })),
    skipDuplicates: true,
  });
}

export async function listRoles(): Promise<RoleRow[]> {
  const { companyId } = await requirePermission("settings");
  return withTenant(companyId, async (tx) => {
    await ensureDefaultRoles(tx, companyId);
    const roles = await tx.companyRole.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      baseRole: r.baseRole,
      permissions: r.permissions,
      lockMinutes: r.lockMinutes ?? DEFAULT_LOCK_MINUTES[r.name] ?? 10,
      isSystem: r.isSystem,
      users: r._count.users,
    }));
  });
}

const PermissionList = z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]]));

export async function updateRolePermissions(roleId: string, permissions: string[]): Promise<ActionResult> {
  const { companyId } = await requirePermission("settings");
  const parsed = PermissionList.safeParse(permissions);
  if (!parsed.success) return { success: false, error: "Permisos no válidos" };
  const result = await withTenant(companyId, async (tx) => {
    const role = await tx.companyRole.findFirst({ where: { id: roleId, companyId } });
    if (!role) return "Rol no encontrado";
    // El dueño siempre conserva todos los permisos: nadie se queda sin poder administrar.
    if (role.name === "Dueño") return "El rol Dueño siempre tiene todos los permisos";
    await tx.companyRole.update({ where: { id: roleId }, data: { permissions: [...new Set(parsed.data)] } });
    return null;
  });
  if (result) return { success: false, error: result };
  revalidatePath("/settings");
  return { success: true };
}

const NewRole = z.object({
  name: z.string().trim().min(2, "Escribe un nombre").max(40, "El nombre es demasiado largo"),
  baseRole: z.enum(["GERENTE", "VENDEDOR"]),
  permissions: PermissionList,
});

export async function createRole(input: unknown): Promise<ActionResult> {
  const { companyId } = await requirePermission("settings");
  const parsed = NewRole.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos" };
  try {
    await withTenant(companyId, async (tx) => {
      await ensureDefaultRoles(tx, companyId);
      await tx.companyRole.create({ data: { companyId, ...parsed.data, isSystem: false } });
    });
  } catch {
    return { success: false, error: "Ya existe un rol con ese nombre" };
  }
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  const { companyId } = await requirePermission("settings");
  const result = await withTenant(companyId, async (tx) => {
    const role = await tx.companyRole.findFirst({ where: { id: roleId, companyId }, include: { _count: { select: { users: true } } } });
    if (!role) return "Rol no encontrado";
    if (role.isSystem) return "Los roles base no se pueden eliminar";
    if (role._count.users > 0) return "Hay personas con este rol: cámbialas de rol primero";
    await tx.companyRole.delete({ where: { id: roleId } });
    return null;
  });
  if (result) return { success: false, error: result };
  revalidatePath("/settings");
  return { success: true };
}

// Asigna un rol a una persona. El rol base (gerente/vendedor) se aplica a su cuenta; un vendedor
// necesita sucursal. Nadie puede quitarse a sí mismo el acceso de administración.
export async function assignRole(userId: string, roleId: string | null): Promise<ActionResult> {
  const session = await requirePermission("settings");
  const { companyId } = session;
  const result = await withTenant(companyId, async (tx) => {
    const user = await tx.user.findFirst({ where: { id: userId, companyId } });
    if (!user) return "Persona no encontrada";
    if (roleId === null) {
      await tx.user.update({ where: { id: userId }, data: { roleId: null } });
      return null;
    }
    const role = await tx.companyRole.findFirst({ where: { id: roleId, companyId } });
    if (!role) return "Rol no encontrado";
    if (userId === session.userId && role.baseRole !== "GERENTE") return "No puedes quitarte el acceso de administración";
    if (role.baseRole === "VENDEDOR" && !user.branchId) {
      const branch = await tx.branch.findFirst({ where: { companyId, isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
      if (!branch) return "Crea una sucursal antes de asignar este rol";
      await tx.user.update({ where: { id: userId }, data: { roleId, role: role.baseRole, branchId: branch.id } });
      return null;
    }
    await tx.user.update({ where: { id: userId }, data: { roleId, role: role.baseRole } });
    return null;
  });
  if (result) return { success: false, error: result };
  revalidatePath("/settings");
  revalidatePath("/employees");
  return { success: true };
}

// Minutos sin actividad antes de bloquear la pantalla de las personas con este rol (5, 10 o 15).
export async function updateRoleLockMinutes(roleId: string, minutes: number): Promise<ActionResult> {
  const { companyId } = await requirePermission("settings");
  if (!(LOCK_MINUTE_CHOICES as readonly number[]).includes(minutes)) return { success: false, error: "Elige 5, 10 o 15 minutos" };
  const done = await withTenant(companyId, async (tx) => {
    const role = await tx.companyRole.findFirst({ where: { id: roleId, companyId }, select: { id: true } });
    if (!role) return false;
    await tx.companyRole.update({ where: { id: roleId }, data: { lockMinutes: minutes } });
    return true;
  });
  if (!done) return { success: false, error: "Rol no encontrado" };
  revalidatePath("/settings");
  return { success: true };
}
