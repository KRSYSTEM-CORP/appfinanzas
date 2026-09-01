"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { withSuperAdmin } from "@/lib/tenant-db";
import {
  PLATFORM_SETTINGS_ID,
  TRIAL_DAYS,
  FALLBACK_MONTHLY_FEE_USD_CENTS,
  monthsCoveredWithBonus,
  extendDueDateByMonths,
} from "@/lib/billing";
import { sendAnnouncementEmail } from "@/lib/email";
import {
  AnnouncementSchema,
  BillingCycleSchema,
  MaintenancePaymentSchema,
  RejectPaymentReportSchema,
  PlatformSettingsSchema,
} from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

async function requireSuperAdmin() {
  const session = await getSession();
  // See app/api/auth/clear-session/route.ts — a stale-but-signed cookie
  // (deleted/suspended user) can't have its cookie cleared here if this is
  // reached during a plain page render, so route through the Route Handler
  // instead of redirecting straight to /login.
  if (!session) redirect("/api/auth/clear-session");
  if (!session.isSuperAdmin) redirect("/pos");
  return session;
}

// One row per company (not per user) so the panel groups a company's owner
// account together with any employees it has registered — the users array
// is ordered owner-first (GERENTE, oldest first) so `users[0]` is always the
// account created during signup, the one every company-level action targets.
// select (not include) on purpose: this feeds straight into a Client
// Component (AdminUserTable) — Company.exchangeRate is a Prisma Decimal,
// which isn't a plain serializable object, and every User row carries
// passwordHash. Selecting only what the table actually renders avoids both
// the Decimal-across-the-client-boundary React error and shipping a
// password hash to the browser for no reason.
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
        createdAt: true,
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

// Signup is self-serve now (see createCompanyWithOwner in
// lib/company-provisioning.ts) — a new company is ACTIVE with its trial
// running from the moment it's created, no approval needed. This stays only
// to let a super admin manually reactivate/re-price a PENDING account from
// before that change (or any created directly in the DB). Approving also
// sets up the billing cycle in the same step: a monthlyFee/nextPaymentDueDate
// left blank in the form falls back to the platform's default fee and a free
// TRIAL_DAYS-day trial starting today. No Payment record is created here
// since a trial isn't a payment.
export async function approveUser(userId: string, billing: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = BillingCycleSchema.safeParse(billing);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos de cobro inválidos" };
  }

  const approved = await withSuperAdmin(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== "PENDING") return false;

    const settings = await tx.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    await tx.user.update({ where: { id: userId }, data: { status: "ACTIVE" } });
    await tx.company.update({
      where: { id: user.companyId },
      data: {
        monthlyFeeUsdCents:
          parsed.data.monthlyFee ?? settings?.defaultMonthlyFeeUsdCents ?? FALLBACK_MONTHLY_FEE_USD_CENTS,
        nextPaymentDueDate: parsed.data.nextPaymentDueDate ?? trialEnd,
      },
    });
    return true;
  });

  if (!approved) {
    return { success: false, error: "Usuario no encontrado o ya fue procesado" };
  }
  revalidatePath("/admin");
  return { success: true };
}

export async function denyUser(userId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const result = await withSuperAdmin((tx) =>
    tx.user.updateMany({
      where: { id: userId, status: "PENDING" },
      data: { status: "SUSPENDED" },
    })
  );
  if (result.count === 0) {
    return { success: false, error: "Usuario no encontrado o ya fue procesado" };
  }
  revalidatePath("/admin");
  return { success: true };
}

export async function suspendUser(userId: string): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  if (session.userId === userId) {
    return { success: false, error: "No puedes suspender tu propia cuenta de administrador" };
  }
  await withSuperAdmin((tx) => tx.user.updateMany({ where: { id: userId }, data: { status: "SUSPENDED" } }));
  revalidatePath("/admin");
  return { success: true };
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await withSuperAdmin((tx) => tx.user.updateMany({ where: { id: userId }, data: { status: "ACTIVE" } }));
  revalidatePath("/admin");
  return { success: true };
}

// Records a confirmed maintenance payment and pushes out the due date — this
// is the only way to unblock a company past its grace period. The subscription
// is always paid in USDT via Binance, so there's no exchange rate to snapshot
// here anymore — Payment.exchangeRate stays null for anything recorded from
// this point on (see the historical note on that column).
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

  revalidatePath("/admin");
  revalidatePath("/settings");
  revalidatePath("/billing");
  return { success: true };
}

export async function setCompanyExempt(companyId: string, exempt: boolean): Promise<ActionResult> {
  await requireSuperAdmin();
  await withSuperAdmin((tx) => tx.company.update({ where: { id: companyId }, data: { isExempt: exempt } }));
  revalidatePath("/admin");
  revalidatePath("/settings");
  return { success: true };
}

// Permanently removes a denied/suspended company and everything under it
// (users, products, customers, sales, quotes, payments — all cascade via the
// schema's onDelete: Cascade). Restricted to companies whose every user is
// SUSPENDED so an active or pending tenant's data can never be wiped this way.
export async function deleteCompany(companyId: string): Promise<ActionResult> {
  await requireSuperAdmin();

  const deleted = await withSuperAdmin(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      include: { users: true },
    });
    if (!company || company.users.length === 0) return false;
    if (!company.users.every((u) => u.status === "SUSPENDED")) return false;

    await tx.company.delete({ where: { id: companyId } });
    return true;
  });

  if (!deleted) {
    return { success: false, error: "Solo se pueden eliminar empresas denegadas o suspendidas" };
  }
  revalidatePath("/admin");
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

// Approving a self-reported payment sums up the payment-method lines the
// company user entered (their claim of what they actually paid) rather than
// assuming it matches the configured monthly fee exactly — it creates the
// same kind of Payment record recordMaintenancePayment does, using the
// platform-wide rate, and pushes the due date out by however many months
// that amount covers (see monthsCoveredWithBonus — a full year prepaid
// earns 2 bonus months), which unblocks the company. Falls back to a flat
// single month if the company somehow has no monthlyFeeUsdCents configured
// (shouldn't happen for anything approved after the trial-defaults change,
// but a pre-existing company could still be in that state).
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
    const months = company.monthlyFeeUsdCents
      ? monthsCoveredWithBonus(totalUsdCents, company.monthlyFeeUsdCents)
      : 1;
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

    return { ok: true as const };
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }
  revalidatePath("/admin");
  revalidatePath("/billing");
  revalidatePath("/settings");
  return { success: true };
}

export async function rejectPaymentReport(reportId: string, input: unknown): Promise<ActionResult> {
  const session = await requireSuperAdmin();
  const parsed = RejectPaymentReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const result = await withSuperAdmin((tx) =>
    tx.paymentReport.updateMany({
      where: { id: reportId, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedById: session.userId,
        reviewedAt: new Date(),
        reviewNote: parsed.data.reviewNote,
      },
    })
  );

  if (result.count === 0) {
    return { success: false, error: "Reporte no encontrado o ya fue procesado" };
  }
  revalidatePath("/admin");
  revalidatePath("/billing");
  return { success: true };
}

export async function getPlatformSettings(): Promise<{
  paymentInstructions: string | null;
  binanceQrDataUrl: string | null;
  binanceId: string | null;
  pagoMovilBank: string | null;
  pagoMovilPhone: string | null;
  pagoMovilId: string | null;
  defaultMonthlyFeeUsdCents: number | null;
}> {
  await requireSuperAdmin();
  const settings = await prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } });
  return {
    paymentInstructions: settings?.paymentInstructions ?? null,
    binanceQrDataUrl: settings?.binanceQrDataUrl ?? null,
    binanceId: settings?.binanceId ?? null,
    pagoMovilBank: settings?.pagoMovilBank ?? null,
    pagoMovilPhone: settings?.pagoMovilPhone ?? null,
    pagoMovilId: settings?.pagoMovilId ?? null,
    defaultMonthlyFeeUsdCents: settings?.defaultMonthlyFeeUsdCents ?? null,
  };
}

// One row per company owner (GERENTE, real email) — excludes employee
// accounts, which get an auto-generated @kyra.local placeholder email at
// creation (see createEmployee, lib/actions/employees.ts) that nobody reads.
export async function listAnnouncementRecipients(): Promise<{ email: string; companyName: string }[]> {
  await requireSuperAdmin();
  const owners = await withSuperAdmin((tx) =>
    tx.user.findMany({
      where: { role: "GERENTE", status: "ACTIVE" },
      select: { email: true, company: { select: { name: true } } },
    })
  );
  return owners.map((o) => ({ email: o.email, companyName: o.company.name }));
}

export type SendAnnouncementResult =
  | { success: true; sent: number; total: number }
  | { success: false; error: string };

// Sends the same announcement to every active company's owner — used for
// product news/updates, not scoped to any one tenant. Individual send
// failures don't fail the whole batch (Promise.allSettled): the admin sees
// how many of the total actually went out.
export async function sendAnnouncement(input: unknown): Promise<SendAnnouncementResult> {
  await requireSuperAdmin();
  const parsed = AnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const recipients = await listAnnouncementRecipients();
  if (recipients.length === 0) {
    return { success: false, error: "No hay empresas activas para notificar" };
  }

  const results = await Promise.allSettled(
    recipients.map((r) => sendAnnouncementEmail(r.email, parsed.data.subject, parsed.data.message))
  );
  const sent = results.filter((r) => r.status === "fulfilled" && r.value).length;

  return { success: true, sent, total: recipients.length };
}

export async function updatePlatformSettings(input: unknown): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = PlatformSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await prisma.platformSettings.upsert({
    where: { id: PLATFORM_SETTINGS_ID },
    create: {
      id: PLATFORM_SETTINGS_ID,
      paymentInstructions: parsed.data.paymentInstructions,
      binanceQrDataUrl: parsed.data.binanceQrDataUrl,
      binanceId: parsed.data.binanceId,
      pagoMovilBank: parsed.data.pagoMovilBank,
      pagoMovilPhone: parsed.data.pagoMovilPhone,
      pagoMovilId: parsed.data.pagoMovilId,
      defaultMonthlyFeeUsdCents: parsed.data.defaultMonthlyFee,
    },
    update: {
      paymentInstructions: parsed.data.paymentInstructions,
      binanceQrDataUrl: parsed.data.binanceQrDataUrl,
      binanceId: parsed.data.binanceId,
      pagoMovilBank: parsed.data.pagoMovilBank,
      pagoMovilPhone: parsed.data.pagoMovilPhone,
      pagoMovilId: parsed.data.pagoMovilId,
      defaultMonthlyFeeUsdCents: parsed.data.defaultMonthlyFee,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/billing");
  revalidatePath("/settings");
  return { success: true };
}
