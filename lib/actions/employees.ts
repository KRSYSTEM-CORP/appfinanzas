"use server";

import { userLimitError } from "@/lib/plan-limits";
import { revalidatePath } from "next/cache";
import { requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { hashPassword } from "@/lib/password";
import { computePinKey, pinProblem } from "@/lib/pin";
import { countManagersWithPin } from "@/lib/pin-rules";
import { EmployeeSchema, EmployeeUpdateSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";
import type { UserStatus } from "@prisma/client";

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está configurado");
  return secret;
}

// select (not a raw findMany) for two reasons: commissionPercent is a
// Prisma Decimal, which can't cross the Server->Client Component boundary
// as-is (React Server Components only accept plain serializable objects) —
// converted to a plain number below; and passwordHash/googleId have no
// reason to ever reach the browser, even hashed.
export async function listEmployees() {
  const { companyId } = await requireManager();
  const users = await withTenant(companyId, (tx) =>
    tx.user.findMany({
    where: { companyId },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      omit: { passwordHash: true, googleId: true, pinHash: true, pinKey: true },
    })
  );
  const withPin = await withTenant(companyId, (tx) =>
    tx.user.findMany({ where: { companyId, pinHash: { not: null } }, select: { id: true } })
  );
  const hasPin = new Set(withPin.map((u) => u.id));
  return users.map((u) => ({
    ...u,
    hasPin: hasPin.has(u.id),
    commissionPercent: u.commissionPercent != null ? Number(u.commissionPercent) : null,
  }));
}

export type EmployeeListItem = Awaited<ReturnType<typeof listEmployees>>[number];

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

// A small JPEG/PNG/WebP data URL produced by resizeImageToDataUrl (256px), or
// null to remove the photo. The size cap is a server-side guard — the client
// already resizes, but nothing stops a hand-crafted request.
const PHOTO_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_PHOTO_CHARS = 200_000;

export async function setEmployeePhoto(userId: string, dataUrl: string | null): Promise<ActionResult> {
  const { companyId } = await requireManager();
  if (dataUrl !== null && (dataUrl.length > MAX_PHOTO_CHARS || !PHOTO_DATA_URL.test(dataUrl))) {
    return { success: false, error: "La imagen no es válida o es demasiado grande." };
  }
  const updated = await withTenant(companyId, (tx) =>
    tx.user.updateMany({ where: { id: userId, companyId }, data: { photoDataUrl: dataUrl } })
  );
  if (updated.count === 0) return { success: false, error: "Empleado no encontrado" };
  revalidatePath("/employees");
  return { success: true };
}

export async function createEmployee(formData: FormData): Promise<ActionResult> {
  const { companyId, plan } = await requireManager();
  const parsed = EmployeeSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    pin: formData.get("pin"),
    role: formData.get("role"),
    branchId: formData.get("branchId"),
    allowedSections: formData.getAll("allowedSections"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const { firstName, lastName, pin, role, branchId, allowedSections } = parsed.data;

  const pinIssue = pinProblem(pin);
  if (pinIssue) return { success: false, error: pinIssue.replace("El PIN", "El código personal") };
  // Primero el gerente: hasta que un gerente tenga PIN no se crean perfiles nuevos.
  if ((await withTenant(companyId, (tx) => countManagersWithPin(tx, companyId))) === 0) {
    return { success: false, error: "Primero crea tu propio PIN de gerente (al entrar con tu correo). Después podrás crear los perfiles." };
  }

  const limitMsg = await withTenant(companyId, (tx) => userLimitError(tx, companyId, plan));
  if (limitMsg) return { success: false, error: limitMsg };

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

  try {
    await withTenant(companyId, (tx) =>
      tx.user.create({
      data: {
        // Employees don't have a real login email — a placeholder keeps the
        // still-globally-unique email column satisfied without ever being
        // shown or used to log in (see loginEmployee() in lib/actions/auth.ts).
        email: `empleado.${companyId}.${firstName}.${lastName}.${Date.now()}@kyra.local`.toLowerCase(),
        // Sin contraseña propia: entra por la empresa y su código personal (PIN).
        pinHash: hashPassword(pin),
        pinKey: computePinKey(authSecret(), companyId, pin),
        companyId,
        firstName,
        lastName,
        role,
        branchId: resolvedBranchId,
        status: "ACTIVE",
        allowedSections: role === "VENDEDOR" ? allowedSections : [],
        hasSeenTour: false,
        },
      })
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return { success: false, error: "Ese código personal ya lo usa otra persona. Elige uno distinto." };
    }
    throw error;
  }

  revalidatePath("/employees");
  return { success: true };
}

export async function updateEmployee(userId: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = EmployeeUpdateSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    role: formData.get("role"),
    branchId: formData.get("branchId"),
    allowedSections: formData.getAll("allowedSections"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { firstName, lastName, role, branchId, allowedSections } = parsed.data;

  let resolvedBranchId: string | null = null;
  if (role === "VENDEDOR") {
    const branch = await withTenant(companyId, (tx) =>
      tx.branch.findFirst({ where: { id: branchId, companyId, isActive: true } })
    );
    if (!branch) return { success: false, error: "Sucursal no encontrada" };
    resolvedBranchId = branch.id;
  }

  let result: { ok: true } | { ok: false; error: string };
  try {
    result = await withTenant(companyId, async (tx) => {
    const target = await tx.user.findFirst({ where: { id: userId, companyId } });
    if (!target) return { ok: false as const, error: "Empleado no encontrado" };

    if (target.role === "GERENTE" && role !== "GERENTE") {
      const stillHasManager = await hasOtherActiveManager(tx, companyId, userId);
      if (!stillHasManager) {
        return { ok: false as const, error: "No puedes quitarle el rol de gerente al único gerente activo" };
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        firstName,
        lastName,
        role,
        branchId: resolvedBranchId,
        allowedSections: role === "VENDEDOR" ? allowedSections : [],
      },
    });
    return { ok: true as const };
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: string }).code === "P2002") {
      return { success: false, error: "Ese usuario ya está asignado a otra persona" };
    }
    throw error;
  }

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
