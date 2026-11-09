"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireManager, requireSession, setSessionCookie } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { PIN_PATTERN, computePinKey, pinProblem } from "@/lib/pin";
import { checkRateLimit, clearAttempts, rateLimitMessage, recordFailedAttempt } from "@/lib/rate-limit";
import type { ActionResult } from "@/lib/types";

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está configurado");
  return secret;
}

// El gerente pone, cambia o quita (pin null) el PIN de una persona de su empresa.
// Dos personas de la misma empresa no pueden tener el mismo PIN.
export async function setUserPin(userId: string, pin: string | null): Promise<ActionResult> {
  const { companyId } = await requireManager();

  const target = await withTenant(companyId, (tx) =>
    tx.user.findFirst({ where: { id: userId, companyId }, select: { id: true } })
  );
  if (!target) return { success: false, error: "Persona no encontrada" };

  if (pin == null || pin === "") {
    await withTenant(companyId, (tx) =>
      tx.user.update({ where: { id: userId }, data: { pinHash: null, pinKey: null } })
    );
    revalidatePath("/employees");
    return { success: true };
  }

  const problem = pinProblem(pin);
  if (problem) return { success: false, error: problem };

  try {
    await withTenant(companyId, (tx) =>
      tx.user.update({
        where: { id: userId },
        data: { pinHash: hashPassword(pin), pinKey: computePinKey(authSecret(), companyId, pin) },
      })
    );
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return { success: false, error: "Ese PIN ya lo usa otra persona. Elige uno distinto." };
    }
    throw err;
  }
  revalidatePath("/employees");
  return { success: true };
}

// Bloquea la pantalla: la sesión sigue siendo de la empresa, pero nada responde
// hasta desbloquear con un PIN. Solo quien ya tiene PIN puede bloquear (si no,
// no podría volver a entrar sin cerrar sesión).
export async function lockSession(): Promise<ActionResult> {
  const session = await requireSession();
  if (!session.hasPin) return { success: false, error: "Primero pide a tu gerente que te asigne un PIN." };
  await setSessionCookie({
    uid: session.userId,
    cid: session.companyId,
    companyName: session.companyName,
    bid: session.branchId,
    lk: true,
  });
  revalidatePath("/", "layout");
  return { success: true };
}

export type LockProfile = { id: string; name: string; role: "GERENTE" | "VENDEDOR"; photoDataUrl: string | null };

// Perfiles que se pueden elegir en la pantalla de bloqueo: personas activas de
// esta empresa con PIN. Solo se entregan con la pantalla bloqueada.
export async function listLockProfiles(): Promise<LockProfile[]> {
  const session = await getSession();
  if (!session || !session.locked) return [];
  const users = await withTenant(session.companyId, (tx) =>
    tx.user.findMany({
      where: { companyId: session.companyId, status: "ACTIVE", pinHash: { not: null } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, role: true, photoDataUrl: true },
    })
  );
  return users.map((u) => ({
    id: u.id,
    // Sin nombre (la cuenta dueña) se muestra la parte local del correo, no el correo completo.
    name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email.split("@")[0],
    role: u.role,
    photoDataUrl: u.photoDataUrl,
  }));
}

const PER_PERSON_MAX = 5;
const PER_COMPANY_MAX = 30;
const WINDOW_MS = 15 * 60_000;

// Desbloquea eligiendo un perfil y su PIN. Límite de intentos por persona y por
// empresa, para que nadie pruebe PINs sin parar con una pantalla bloqueada.
export async function unlockWithPin(userId: string, pin: string): Promise<ActionResult> {
  const session = await getSession();
  if (!session) return { success: false, error: "Tu sesión terminó. Inicia sesión de nuevo." };
  if (!session.locked) return { success: true };

  const personScope = "pin-unlock";
  const companyScope = "pin-unlock-company";
  const [person, company] = await Promise.all([
    checkRateLimit(personScope, userId, PER_PERSON_MAX, WINDOW_MS),
    checkRateLimit(companyScope, session.companyId, PER_COMPANY_MAX, WINDOW_MS),
  ]);
  if (!person.allowed || !company.allowed) {
    return { success: false, error: rateLimitMessage(Math.max(person.retryAfterMinutes, company.retryAfterMinutes)) };
  }

  const target = await withTenant(session.companyId, (tx) =>
    tx.user.findFirst({
      where: { id: userId, companyId: session.companyId, status: "ACTIVE" },
      select: { id: true, pinHash: true, branchId: true },
    })
  );
  const ok = Boolean(target?.pinHash) && PIN_PATTERN.test(pin) && verifyPassword(pin, target!.pinHash!);
  if (!ok || !target) {
    await Promise.all([recordFailedAttempt(personScope, userId), recordFailedAttempt(companyScope, session.companyId)]);
    return { success: false, error: "PIN incorrecto" };
  }

  await clearAttempts(personScope, userId);
  await setSessionCookie({
    uid: target.id,
    cid: session.companyId,
    companyName: session.companyName,
    bid: target.branchId ?? session.branchId,
    lk: false,
  });
  revalidatePath("/", "layout");
  return { success: true };
}
