"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireManager, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { signSessionToken, SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from "@/lib/session-token";
import type { ActionResult } from "@/lib/types";

export async function listBranches() {
  const { companyId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.branch.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } })
  );
}

export async function createBranch(formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { success: false, error: "El nombre de la sucursal es obligatorio" };

  try {
    await withTenant(companyId, (tx) => tx.branch.create({ data: { companyId, name } }));
  } catch {
    return { success: false, error: "Ya existe una sucursal con ese nombre" };
  }

  revalidatePath("/settings");
  return { success: true };
}

export async function updateBranch(id: string, formData: FormData): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const name = String(formData.get("name") ?? "").trim();
  const isActive = formData.get("isActive") === "true";
  if (!name) return { success: false, error: "El nombre de la sucursal es obligatorio" };

  try {
    const result = await withTenant(companyId, (tx) =>
      tx.branch.updateMany({ where: { id, companyId }, data: { name, isActive } })
    );
    if (result.count === 0) return { success: false, error: "Sucursal no encontrada" };
  } catch {
    return { success: false, error: "Ya existe una sucursal con ese nombre" };
  }

  revalidatePath("/settings");
  return { success: true };
}

// Lets a GERENTE/owner change which branch their session is currently
// scoped to (or switch to "Todas las sucursales", branchId null, for a
// consolidated view) — re-issues the session cookie with the new bid.
// VENDEDOR never calls this; they're always pinned to their own User.branchId
// (see getSession() in lib/session.ts, which ignores the cookie for them).
export async function switchBranch(branchId: string | null): Promise<ActionResult> {
  const session = await requireManager();

  if (branchId) {
    const branch = await withTenant(session.companyId, (tx) =>
      tx.branch.findFirst({ where: { id: branchId, companyId: session.companyId, isActive: true } })
    );
    if (!branch) return { success: false, error: "Sucursal no encontrada" };
  }

  const token = signSessionToken({
    uid: session.userId,
    cid: session.companyId,
    companyName: session.companyName,
    bid: branchId,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  revalidatePath("/", "layout");
  return { success: true };
}
