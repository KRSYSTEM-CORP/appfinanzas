"use server";

import { revalidatePath } from "next/cache";
import { getSession, requireManager, requireSession, setSessionCookie } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { PIN_PATTERN, computePinKey, pinProblem } from "@/lib/pin";
import { countManagersWithPin } from "@/lib/pin-rules";
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
    tx.user.findFirst({ where: { id: userId, companyId }, select: { id: true, role: true, pinHash: true } })
  );
  if (!target) return { success: false, error: "Persona no encontrada" };

  if (pin == null || pin === "") {
    // No se puede dejar la empresa sin ningún PIN de gerente mientras otras personas
    // dependen de él para entrar.
    if (target.role === "GERENTE" && target.pinHash) {
      const others = await withTenant(companyId, (tx) => countManagersWithPin(tx, companyId, userId));
      const anyoneElseHasPin = await withTenant(companyId, (tx) =>
        tx.user.count({ where: { companyId, id: { not: userId }, pinHash: { not: null } } })
      );
      if (others === 0 && anyoneElseHasPin > 0) {
        return { success: false, error: "No puedes quitar el único PIN de gerente: otras personas dependen de él." };
      }
    }
    await withTenant(companyId, (tx) =>
      tx.user.update({ where: { id: userId }, data: { pinHash: null, pinKey: null } })
    );
    revalidatePath("/employees");
    return { success: true };
  }

  const problem = pinProblem(pin);
  if (problem) return { success: false, error: problem };

  // Primero el gerente: nadie más puede recibir su código personal hasta que exista
  // al menos un PIN de gerente.
  if (target.role !== "GERENTE") {
    const managers = await withTenant(companyId, (tx) => countManagersWithPin(tx, companyId));
    if (managers === 0) {
      return { success: false, error: "Primero crea el PIN de un gerente (el tuyo). Después podrás asignar el de los demás." };
    }
  }

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

// access: «pin» = escribe su PIN; «create» = es gerente y la empresa aún no tiene ningún PIN de
// gerente, así que crea el suyo aquí por primera vez; «ask-manager» = todavía no tiene PIN y se
// lo asigna un gerente desde Ajustes.
export type LockProfile = {
  id: string;
  name: string;
  role: "GERENTE" | "VENDEDOR";
  photoDataUrl: string | null;
  access: "pin" | "create" | "ask-manager";
  // Para el aviso del perfil sin PIN: si ya hay un gerente con PIN o aún no.
  managerPinReady: boolean;
};

// Perfiles que se pueden elegir tras entrar con el correo y la clave (o al bloquear): todas las
// personas activas de la empresa. Solo se entregan con la pantalla bloqueada.
export async function listLockProfiles(): Promise<LockProfile[]> {
  const session = await getSession();
  if (!session || !session.locked) return [];
  const users = await withTenant(session.companyId, (tx) =>
    tx.user.findMany({
      where: { companyId: session.companyId, status: "ACTIVE" },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, role: true, photoDataUrl: true, pinHash: true },
    })
  );
  const managerPinReady = users.some((u) => u.role === "GERENTE" && u.pinHash != null);
  return users.map((u) => ({
    id: u.id,
    // Sin nombre (la cuenta dueña) se muestra la parte local del correo, no el correo completo.
    name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.email.split("@")[0],
    role: u.role,
    photoDataUrl: u.photoDataUrl,
    access: u.pinHash ? "pin" : u.role === "GERENTE" && !managerPinReady ? "create" : "ask-manager",
    managerPinReady,
  }));
}

function homePath(role: string): "/home" | "/pos" {
  return role === "GERENTE" ? "/home" : "/pos";
}

const PER_PERSON_MAX = 5;
const PER_COMPANY_MAX = 30;
const WINDOW_MS = 15 * 60_000;

// Desbloquea eligiendo un perfil y su PIN. Límite de intentos por persona y por
// empresa, para que nadie pruebe PINs sin parar con una pantalla bloqueada.
export async function unlockWithPin(userId: string, pin: string): Promise<ActionResult & { redirectTo?: string }> {
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
      select: { id: true, pinHash: true, branchId: true, role: true },
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
  return { success: true, redirectTo: homePath(target.role) };
}

// Primer PIN de la empresa: solo un gerente sin PIN, mientras ningún gerente tenga uno todavía,
// puede crearlo desde la pantalla de acceso. Es el paso que desbloquea a todos los demás: el
// PIN de los vendedores lo asigna después un gerente desde Ajustes.
export async function createFirstManagerPin(
  userId: string,
  pin: string,
  confirm: string
): Promise<ActionResult & { redirectTo?: string }> {
  const session = await getSession();
  if (!session) return { success: false, error: "Tu sesión terminó. Inicia sesión de nuevo." };
  if (!session.locked) return { success: false, error: "Ya estás dentro." };
  if (pin !== confirm) return { success: false, error: "Los dos PIN no coinciden" };
  const problem = pinProblem(pin);
  if (problem) return { success: false, error: problem };

  const scope = "pin-create";
  const limit = await checkRateLimit(scope, session.companyId, PER_COMPANY_MAX, WINDOW_MS);
  if (!limit.allowed) return { success: false, error: rateLimitMessage(limit.retryAfterMinutes) };

  const outcome = await withTenant(session.companyId, async (tx) => {
    const target = await tx.user.findFirst({
      where: { id: userId, companyId: session.companyId, status: "ACTIVE" },
      select: { id: true, role: true, pinHash: true, branchId: true },
    });
    if (!target || target.role !== "GERENTE" || target.pinHash) {
      return { ok: false as const, error: "Este perfil no puede crear su PIN aquí." };
    }
    if ((await countManagersWithPin(tx, session.companyId)) > 0) {
      return { ok: false as const, error: "Ya hay un gerente con PIN. Pídele que te asigne el tuyo desde Ajustes." };
    }
    await tx.user.update({
      where: { id: target.id },
      data: { pinHash: hashPassword(pin), pinKey: computePinKey(authSecret(), session.companyId, pin) },
    });
    return { ok: true as const, target };
  });
  if (!outcome.ok) {
    await recordFailedAttempt(scope, session.companyId);
    return { success: false, error: outcome.error };
  }

  await setSessionCookie({
    uid: outcome.target.id,
    cid: session.companyId,
    companyName: session.companyName,
    bid: outcome.target.branchId ?? session.branchId,
    lk: false,
  });
  revalidatePath("/", "layout");
  return { success: true, redirectTo: homePath(outcome.target.role) };
}
