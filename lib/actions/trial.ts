"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withSuperAdmin } from "@/lib/tenant-db";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { logPlatformAudit } from "@/lib/platform-audit";
import { MAX_FREE_DAYS, addFreeDays } from "@/lib/trial";
import type { ActionResult } from "@/lib/types";

export type TrialCompanyRow = {
  id: string;
  name: string;
  loginCode: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  /** Fin de la prueba (vencimiento de la suscripción). */
  trialEndsAt: string | null;
  freeDaysGranted: number;
  plan: string;
};

// Empresas que todavía no han pagado nada (están en prueba gratis o se les acabó), las más próximas a vencer primero.
// Solo el superadministrador de la plataforma las ve.
export async function listTrialCompanies(): Promise<TrialCompanyRow[]> {
  await requireSuperAdmin();
  const rows = await withSuperAdmin((tx) =>
    tx.company.findMany({
      where: { isExempt: false, payments: { none: {} }, planChosen: true },
      select: {
        id: true,
        name: true,
        loginCode: true,
        createdAt: true,
        nextPaymentDueDate: true,
        freeDaysGranted: true,
        plan: true,
        users: { where: { role: "GERENTE" }, orderBy: { createdAt: "asc" }, take: 1, select: { firstName: true, lastName: true, email: true } },
      },
    })
  );
  return rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      loginCode: c.loginCode,
      ownerName: [c.users[0]?.firstName, c.users[0]?.lastName].filter(Boolean).join(" ") || null,
      ownerEmail: c.users[0]?.email ?? null,
      createdAt: c.createdAt.toISOString(),
      trialEndsAt: c.nextPaymentDueDate ? c.nextPaymentDueDate.toISOString() : null,
      freeDaysGranted: c.freeDaysGranted,
      plan: c.plan,
    }))
    .sort((a, b) => (a.trialEndsAt ?? "9") .localeCompare(b.trialEndsAt ?? "9"));
}

const GrantSchema = z.object({
  companyId: z.string().trim().min(1).max(40),
  days: z.number().int().min(1, "Escribe al menos 1 día").max(MAX_FREE_DAYS, `Máximo ${MAX_FREE_DAYS} días por vez`),
  note: z.string().trim().max(200).optional(),
});

// Regala días gratis a una empresa que todavía no ha pagado: alarga su prueba. Si la prueba ya había terminado, la
// empresa vuelve a poder entrar y, al acabarse los días, podrá pagar su suscripción como siempre.
export async function grantFreeDays(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = GrantSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;
  const result = await withSuperAdmin(async (tx) => {
    const c = await tx.company.findUnique({
      where: { id: d.companyId },
      select: { id: true, name: true, isExempt: true, nextPaymentDueDate: true, _count: { select: { payments: true } } },
    });
    if (!c) return { ok: false as const, error: "La empresa no existe" };
    if (c.isExempt) return { ok: false as const, error: "Esta empresa está exenta de pago: no necesita días gratis." };
    if (c._count.payments > 0) return { ok: false as const, error: "Esta empresa ya pagó una suscripción: sus días se manejan desde Cobranza." };
    const next = addFreeDays(c.nextPaymentDueDate, d.days);
    await tx.company.update({ where: { id: c.id }, data: { nextPaymentDueDate: next, freeDaysGranted: { increment: d.days } } });
    return { ok: true as const, next, name: c.name };
  });
  if (!result.ok) return { success: false, error: result.error };
  await logPlatformAudit(session.userId, "prueba.extender", {
    companyId: d.companyId,
    detail: `+${d.days} días · hasta ${result.next.toISOString().slice(0, 10)}${d.note ? ` · ${d.note}` : ""}`,
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/settings");
  revalidatePath("/billing");
  revalidatePath("/", "layout");
  return { success: true };
}
