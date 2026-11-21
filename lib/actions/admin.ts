"use server";

import { PLANS, parsePlanRequest, type PlanId } from "@/lib/plans";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { withSuperAdmin } from "@/lib/tenant-db";
import { requireSuperAdmin } from "@/lib/platform-guard";
import { logPlatformAudit } from "@/lib/platform-audit";
import {
  PLATFORM_SETTINGS_ID,
  TRIAL_DAYS,
  monthsCoveredWithBonus,
  extendDueDateByMonths,
} from "@/lib/billing";
import { fetchBcvRate } from "@/lib/bcv-rate";
import { invalidateCache } from "@/lib/cache";
import { isKnownFeature } from "@/lib/features";
import {
  BillingCycleSchema,
  MaintenancePaymentSchema,
  RejectPaymentReportSchema,
  PlatformSettingsSchema,
  ExchangeRateSchema,
} from "@/lib/validations";
import type { ActionResult } from "@/lib/types";
import { notifyLive, posChannel } from "@/lib/realtime";

// Todas las acciones de este archivo empiezan con requireSuperAdmin() (lib/platform-guard.ts)
// y las que cambian algo quedan en el registro de auditoría de la Plataforma.

async function companyIdOfUser(userId: string): Promise<string | null> {
  const u = await withSuperAdmin((tx) => tx.user.findUnique({ where: { id: userId }, select: { companyId: true } }));
  return u?.companyId ?? null;
}

// One row per company (not per user) so the panel groups a company's owner
// account together with any employees it has registered — the users array
// is ordered owner-first (GERENTE, oldest first) so `users[0]` is always the
// account created during signup, the one every company-level action targets.
// select (not include) on purpose: this feeds straight into Client Components —
// Company.exchangeRate is a Prisma Decimal and every User row carries
// passwordHash; selecting only what the panel renders avoids both.
export async function listAllCompanies() {
  await requireSuperAdmin();
  return withSuperAdmin((tx) =>
    tx.company.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        isExempt: true,
        nextPaymentDueDate: true,
        monthlyFeeUsdCents: true,
        plan: true,
        enabledFeatures: true,
        createdAt: true,
        fiscalPhone: true,
        businessWhatsapp: true,
        aiCreditsExtra: true,
        aiCreditsUsed: true,
        crmNote: true,
        crmNextContactAt: true,
        crmTags: true,
        users: {
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            status: true,
            isSuperAdmin: true,
          },
        },
      },
    })
  );
}

// Signup is self-serve now (see createCompanyWithOwner in lib/company-provisioning.ts) — a new
// company is ACTIVE with its trial running from creation. This stays to let a super admin
// reactivate a PENDING account from before that change. The monthly fee defaults to the price of
// the company's plan (lib/plans.ts) and the due date to a free TRIAL_DAYS-day trial.
export async function approveUser(userId: string, billing: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = BillingCycleSchema.safeParse(billing);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos de cobro inválidos" };
  }

  const companyId = await withSuperAdmin(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "PENDING") return null;
    const company = await tx.company.findUnique({ where: { id: user.companyId }, select: { plan: true } });
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    await tx.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
    await tx.company.update({
      where: { id: user.companyId },
      data: {
        monthlyFeeUsdCents: parsed.data.monthlyFee ?? PLANS[(company?.plan ?? "CORPORATIVO") as PlanId].priceUsdCents,
        nextPaymentDueDate: parsed.data.nextPaymentDueDate ?? trialEnd,
      },
    });
    return user.companyId;
  });

  if (!companyId) {
    return { success: false, error: "Usuario no encontrado o ya fue procesado" };
  }
  await logPlatformAudit(session.userId, "empresa.aprobar", { companyId });
  revalidatePath("/admin", "layout");
  return { success: true };
}

// Cambia el plan de una empresa y alinea su mensualidad con el precio del plan.
export async function setCompanyPlan(companyId: string, plan: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (!(plan in PLANS)) return { success: false, error: "Plan inválido" };
  const def = PLANS[plan as PlanId];
  await withSuperAdmin((tx) =>
    tx.company.update({ where: { id: companyId }, data: { plan: def.id, monthlyFeeUsdCents: def.priceUsdCents } })
  );
  await logPlatformAudit(session.userId, "empresa.plan", { companyId, detail: `Plan ${def.label}` });
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  return { success: true };
}

// Otorga créditos de IA extra a una empresa (no vencen). Solo super admin.
export async function grantAiCredits(companyId: string, amount: number): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (!Number.isInteger(amount) || amount < 1 || amount > 100_000) {
    return { success: false, error: "La cantidad debe ser un número entero entre 1 y 100.000" };
  }
  await withSuperAdmin((tx) => tx.company.update({ where: { id: companyId }, data: { aiCreditsExtra: { increment: amount } } }));
  await logPlatformAudit(session.userId, "empresa.creditos", { companyId, detail: `${amount} créditos` });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function listPendingCreditRequests() {
  await requireSuperAdmin();
  return withSuperAdmin((tx) =>
    tx.aiCreditRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      select: { id: true, credits: true, priceCents: true, reference: true, createdAt: true, paymentMethod: true, reporterName: true, reporterPhone: true, reporterEmail: true, proofImageDataUrl: true, company: { select: { name: true } } },
    })
  );
}

// Aprueba (suma los créditos) o rechaza una solicitud de compra. Solo si sigue pendiente.
export async function resolveCreditRequest(id: string, approve: boolean): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const companyId = await withSuperAdmin(async (tx) => {
    const r = await tx.aiCreditRequest.findUnique({ where: { id }, select: { companyId: true, credits: true, status: true } });
    if (!r || r.status !== "PENDING") return null;
    const upd = await tx.aiCreditRequest.updateMany({
      where: { id, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", reviewedAt: new Date() },
    });
    if (upd.count === 0) return null;
    if (approve) await tx.company.update({ where: { id: r.companyId }, data: { aiCreditsExtra: { increment: r.credits } } });
    return r.companyId;
  });
  if (!companyId) return { success: false, error: "La solicitud ya fue procesada" };
  await logPlatformAudit(session.userId, "creditos.resolver", { companyId, detail: approve ? "Aprobada" : "Rechazada" });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function denyUser(userId: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const companyId = await companyIdOfUser(userId);
  const result = await withSuperAdmin((tx) =>
    tx.user.updateMany({
      where: { id: userId, status: "PENDING" },
      data: { status: "SUSPENDED" },
    })
  );
  if (result.count === 0) {
    return { success: false, error: "Usuario no encontrado o ya fue procesado" };
  }
  await logPlatformAudit(session.userId, "empresa.rechazar", { companyId });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function suspendUser(userId: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (session.userId === userId) {
    return { success: false, error: "No puedes suspender tu propia cuenta de administrador" };
  }
  const companyId = await companyIdOfUser(userId);
  await withSuperAdmin((tx) => tx.user.updateMany({ where: { id: userId }, data: { status: "SUSPENDED" } }));
  await logPlatformAudit(session.userId, "empresa.suspender", { companyId });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const companyId = await companyIdOfUser(userId);
  await withSuperAdmin((tx) => tx.user.updateMany({ where: { id: userId }, data: { status: "ACTIVE" } }));
  await logPlatformAudit(session.userId, "empresa.reactivar", { companyId });
  revalidatePath("/admin", "layout");
  return { success: true };
}

// Records a confirmed maintenance payment and pushes out the due date — this
// is the only way to unblock a company past its grace period.
export async function recordMaintenancePayment(companyId: string, input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = MaintenancePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos de pago inválidos" };
  }

  await withSuperAdmin(async (tx) => {
    await tx.payment.create({
      data: {
        companyId,
        amountUsdCents: parsed.data.amount,
        periodEnd: parsed.data.periodEnd,
        note: parsed.data.note,
        verifiedById: session.userId,
      },
    });
    await tx.company.update({
      where: { id: companyId },
      data: {
        monthlyFeeUsdCents: parsed.data.amount,
        nextPaymentDueDate: parsed.data.periodEnd,
      },
    });
  });

  await logPlatformAudit(session.userId, "pago.registrar", { companyId, detail: `$${(parsed.data.amount / 100).toFixed(2)}` });
  revalidatePath("/admin", "layout");
  revalidatePath("/settings");
  revalidatePath("/billing");
  return { success: true };
}

// Reinicia el ciclo de cobro un mes adelante sin registrar un monto (no hay días de gracia:
// ver isCompanyBlocked, lib/billing.ts).
export async function renewSubscriptionManually(companyId: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  await withSuperAdmin((tx) =>
    tx.company.update({ where: { id: companyId }, data: { nextPaymentDueDate: extendDueDateByMonths(null, 1) } })
  );
  await logPlatformAudit(session.userId, "pago.renovar", { companyId });
  revalidatePath("/admin", "layout");
  revalidatePath("/settings");
  revalidatePath("/billing");
  return { success: true };
}

export async function setCompanyExempt(companyId: string, exempt: boolean): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  await withSuperAdmin((tx) => tx.company.update({ where: { id: companyId }, data: { isExempt: exempt } }));
  await logPlatformAudit(session.userId, "empresa.exencion", { companyId, detail: exempt ? "Exenta" : "Con cobro" });
  revalidatePath("/admin", "layout");
  revalidatePath("/settings");
  return { success: true };
}

// Replaces the set of custom features (lib/features.ts) enabled for ONE company.
// Unknown ids are rejected instead of stored so a typo can't silently do nothing.
export async function setCompanyFeatures(companyId: string, features: string[]): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const unique = [...new Set(features)];
  const unknown = unique.find((id) => !isKnownFeature(id));
  if (unknown) return { success: false, error: `Apartado desconocido: ${unknown}` };

  await withSuperAdmin((tx) => tx.company.update({ where: { id: companyId }, data: { enabledFeatures: unique } }));
  await logPlatformAudit(session.userId, "empresa.funciones", { companyId, detail: unique.join(", ") || "Ninguna" });
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  return { success: true };
}

// Permanently removes a denied/suspended company and everything under it (all cascade via the
// schema's onDelete: Cascade). Restricted to companies whose every user is SUSPENDED so an
// active or pending tenant's data can never be wiped this way.
export async function deleteCompany(companyId: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();

  let companyName: string | null = null;
  const deleted = await withSuperAdmin(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      include: { users: true },
    });
    if (!company || company.users.length === 0) return false;
    companyName = company.name;
    if (!company.users.every((u) => u.status === "SUSPENDED")) return false;
    // Fiscal documents are never deleted (audit KRPOS-DB-002; the FKs
    // RESTRICT it too): a company that already invoiced stays suspended.
    const [sales, purchases, closings] = await Promise.all([
      tx.sale.count({ where: { companyId } }),
      tx.purchase.count({ where: { companyId } }),
      tx.cashClosing.count({ where: { companyId } }),
    ]);
    if (sales + purchases + closings > 0) return "has-documents" as const;

    await tx.company.delete({ where: { id: companyId } });
    return true;
  });

  if (deleted === "has-documents") {
    return {
      success: false,
      error: "Esta empresa tiene ventas, compras o cierres registrados (documentos fiscales) y no se puede eliminar. Déjala suspendida.",
    };
  }
  if (!deleted) {
    return { success: false, error: "Solo se pueden eliminar empresas denegadas o suspendidas" };
  }
  await logPlatformAudit(session.userId, "empresa.eliminar", { companyId: null, companyName, detail: companyId });
  revalidatePath("/admin", "layout");
  return { success: true };
}

// Notas internas, etiquetas y próximo contacto de una empresa (CRM). Solo superadmin.
export async function updateCompanyCrm(
  companyId: string,
  input: { note: string; tags: string[]; nextContactAt: string | null }
): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const note = (input.note ?? "").trim().slice(0, 2000);
  const tags = [...new Set((input.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8).map((t) => t.slice(0, 24));
  let next: Date | null = null;
  if (input.nextContactAt) {
    next = new Date(`${input.nextContactAt}T12:00:00Z`);
    if (Number.isNaN(next.getTime())) return { success: false, error: "Fecha inválida" };
  }
  await withSuperAdmin((tx) =>
    tx.company.update({ where: { id: companyId }, data: { crmNote: note || null, crmTags: tags, crmNextContactAt: next } })
  );
  await logPlatformAudit(session.userId, "empresa.crm", { companyId });
  revalidatePath("/admin", "layout");
  return { success: true };
}

export async function listPendingPaymentReports() {
  await requireSuperAdmin();
  return withSuperAdmin((tx) =>
    tx.paymentReport.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { company: { select: { name: true } }, lines: true },
    })
  );
}

// Historial de reportes de pago de suscripción (todos los estados), los más recientes primero.
export async function listPaymentReportHistory(take = 50) {
  await requireSuperAdmin();
  return withSuperAdmin((tx) =>
    tx.paymentReport.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true,
        status: true,
        note: true,
        createdAt: true,
        reviewedAt: true,
        company: { select: { name: true } },
        lines: { select: { paymentMethod: true, amountUsdCents: true, reference: true } },
      },
    })
  );
}

// Approving a self-reported payment sums up the payment-method lines the company user entered
// rather than assuming it matches the configured monthly fee exactly — it creates the same kind
// of Payment record recordMaintenancePayment does and pushes the due date out by however many
// months that amount covers (see monthsCoveredWithBonus). Un cupón reservado al reportar queda
// consumido al aprobar.
export async function approvePaymentReport(reportId: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();

  const result = await withSuperAdmin(async (tx) => {
    const report = await tx.paymentReport.findUnique({
      where: { id: reportId },
      include: { lines: true },
    });
    if (!report || report.status !== "PENDING") {
      return { ok: false as const, error: "Reporte no encontrado o ya fue procesado" };
    }
    if (report.lines.length === 0) {
      return { ok: false as const, error: "El reporte no tiene métodos de pago" };
    }

    const company = await tx.company.findUnique({ where: { id: report.companyId } });
    if (!company) {
      return { ok: false as const, error: "Empresa no encontrada" };
    }

    const totalUsdCents = report.lines.reduce((sum, line) => sum + line.amountUsdCents, 0);

    // Si la empresa pidió cambiar de plan al reportar el pago (nota «Plan solicitado: X.»),
    // el plan y la tarifa se actualizan al aprobar y los meses se calculan con la tarifa nueva.
    // El cambio solo se aplica si lo pagado cubre al menos un mes del plan pedido (el primer mes
    // de Emprende vale lo que indique su precio de bienvenida), con el descuento de cupón ya
    // descontado (se suma de vuelta para comparar contra el precio de lista).
    const requestedPlan = parsePlanRequest(report.note);
    const requestedMin = requestedPlan
      ? Math.min(PLANS[requestedPlan].priceUsdCents, PLANS[requestedPlan].firstMonthUsdCents ?? PLANS[requestedPlan].priceUsdCents)
      : 0;
    const redeemed = await tx.platformCouponRedemption.findMany({ where: { paymentReportId: reportId }, select: { discountUsdCents: true } });
    const discountCents = redeemed.reduce((s, r) => s + r.discountUsdCents, 0);
    const effectiveCents = totalUsdCents + discountCents;
    let feeUsdCents = company.monthlyFeeUsdCents;
    if (requestedPlan && effectiveCents >= requestedMin) {
      feeUsdCents = PLANS[requestedPlan].priceUsdCents;
      await tx.company.update({
        where: { id: report.companyId },
        data: { plan: requestedPlan, monthlyFeeUsdCents: feeUsdCents, planChosen: true },
      });
    }
    const months = feeUsdCents ? monthsCoveredWithBonus(effectiveCents, feeUsdCents) : 1;
    const periodEnd = extendDueDateByMonths(company.nextPaymentDueDate, months || 1);

    await tx.payment.create({
      data: {
        companyId: report.companyId,
        amountUsdCents: totalUsdCents,
        periodEnd,
        note: report.note ? `Reportado por el usuario: ${report.note}` : "Reportado por el usuario",
        verifiedById: session.userId,
      },
    });
    await tx.company.update({ where: { id: report.companyId }, data: { nextPaymentDueDate: periodEnd } });
    await tx.paymentReport.update({
      where: { id: reportId },
      data: { status: "APPROVED", reviewedById: session.userId, reviewedAt: new Date() },
    });

    return { ok: true as const, companyId: report.companyId, totalUsdCents };
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }
  await logPlatformAudit(session.userId, "pago.aprobar", { companyId: result.companyId, detail: `$${(result.totalUsdCents / 100).toFixed(2)}` });
  void notifyLive(posChannel(result.companyId), "payment"); // la empresa ve «¡Pago registrado!» al instante
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  revalidatePath("/settings");
  return { success: true };
}

// Al rechazar un reporte se LIBERA el cupón que se reservó al reportarlo (la empresa puede
// reportar de nuevo con el mismo cupón).
export async function rejectPaymentReport(reportId: string, input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = RejectPaymentReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const companyId = await withSuperAdmin(async (tx) => {
    const report = await tx.paymentReport.findFirst({ where: { id: reportId, status: "PENDING" }, select: { companyId: true } });
    if (!report) return null;
    await tx.paymentReport.update({
      where: { id: reportId },
      data: {
        status: "REJECTED",
        reviewedById: session.userId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
      },
    });
    const held = await tx.platformCouponRedemption.findMany({ where: { paymentReportId: reportId }, select: { id: true, couponId: true } });
    for (const h of held) {
      await tx.platformCouponRedemption.delete({ where: { id: h.id } });
      await tx.platformCoupon.update({ where: { id: h.couponId }, data: { usedCount: { decrement: 1 } } });
    }
    return report.companyId;
  });

  if (!companyId) {
    return { success: false, error: "Reporte no encontrado o ya fue procesado" };
  }
  await logPlatformAudit(session.userId, "pago.rechazar", { companyId, detail: parsed.data.reviewNote });
  void notifyLive(posChannel(companyId), "payment");
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  return { success: true };
}

export type PlatformSettingsView = {
  paymentInstructions: string | null;
  binanceQrDataUrl: string | null;
  binanceId: string | null;
  pagoMovilBank: string | null;
  pagoMovilPhone: string | null;
  pagoMovilId: string | null;
  pagoMovilEnabled: boolean;
  binanceEnabled: boolean;
};

export async function getPlatformSettings(): Promise<PlatformSettingsView> {
  await requireSuperAdmin();
  const settings = await prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return {
    paymentInstructions: settings?.paymentInstructions ?? null,
    binanceQrDataUrl: settings?.binanceQrDataUrl ?? null,
    binanceId: settings?.binanceId ?? null,
    pagoMovilBank: settings?.pagoMovilBank ?? null,
    pagoMovilPhone: settings?.pagoMovilPhone ?? null,
    pagoMovilId: settings?.pagoMovilId ?? null,
    pagoMovilEnabled: settings?.pagoMovilEnabled ?? true,
    binanceEnabled: settings?.binanceEnabled ?? true,
  };
}

export async function updatePlatformSettings(input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = PlatformSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const data = {
    paymentInstructions: parsed.data.paymentInstructions,
    binanceQrDataUrl: parsed.data.binanceQrDataUrl,
    binanceId: parsed.data.binanceId,
    pagoMovilBank: parsed.data.pagoMovilBank,
    pagoMovilPhone: parsed.data.pagoMovilPhone,
    pagoMovilId: parsed.data.pagoMovilId,
  };

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, ...data },
    update: data,
  });

  await logPlatformAudit(session.userId, "pago.metodo", { detail: "Datos de pago actualizados" });
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  revalidatePath("/settings");
  return { success: true };
}

// Muestra u oculta un método en el pago de la suscripción de las empresas (Mi plan).
export async function setPlatformPaymentMethodEnabled(method: "PAGO_MOVIL" | "BINANCE", enabled: boolean): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (method !== "PAGO_MOVIL" && method !== "BINANCE") return { success: false, error: "Método inválido" };
  const data = method === "PAGO_MOVIL" ? { pagoMovilEnabled: enabled } : { binanceEnabled: enabled };
  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, ...data },
    update: data,
  });
  await logPlatformAudit(session.userId, "pago.metodo", { detail: `${method === "BINANCE" ? "Binance Pay" : "Pago Móvil"}: ${enabled ? "visible" : "oculto"}` });
  revalidatePath("/admin", "layout");
  revalidatePath("/settings");
  revalidatePath("/billing");
  return { success: true };
}

// Manual override for KR System's own USD/Bs rate (see getPlatformExchangeRateInfo,
// lib/actions/billing.ts).
export async function updatePlatformExchangeRate(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = ExchangeRateSchema.safeParse({ rate: formData.get("rate") });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Tasa inválida" };
  }

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, platformExchangeRate: parsed.data.rate, platformExchangeRateUpdatedAt: new Date() },
    update: { platformExchangeRate: parsed.data.rate, platformExchangeRateUpdatedAt: new Date() },
  });

  await invalidateCache("platformExchangeRateInfo");
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  return { success: true };
}

// Manual on-demand refresh — the same rate also gets pulled automatically once a day by
// app/api/cron/bcv-rate/route.ts.
export async function fetchAndUpdatePlatformBcvRate(): Promise<ActionResult> {
  await requireSuperAdmin();

  let rate: number;
  try {
    rate = await fetchBcvRate("USD");
  } catch {
    return { success: false, error: "No se pudo consultar la tasa del BCV. Intenta de nuevo." };
  }

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: { id: PLATFORM_SETTINGS_ID, platformExchangeRate: rate, platformExchangeRateUpdatedAt: new Date() },
    update: { platformExchangeRate: rate, platformExchangeRateUpdatedAt: new Date() },
  });

  await invalidateCache("platformExchangeRateInfo");
  revalidatePath("/admin", "layout");
  revalidatePath("/billing");
  return { success: true };
}
