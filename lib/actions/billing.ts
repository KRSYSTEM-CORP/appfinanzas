"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { isCompanyBlocked, PLATFORM_SETTINGS_ID } from "@/lib/billing";
import { PaymentReportSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";

// This whole file deliberately uses getSession() instead of requireSession():
// /billing is exactly the page a billing-blocked company needs to reach to
// report a payment and get itself unblocked, so these actions must never
// trigger the /blocked redirect the way most other actions (including
// requireManager()) do.
async function requireCompanyUser() {
  const session = await getSession();
  // See app/api/auth/clear-session/route.ts — this is called directly from
  // /billing's page render, so a stale-but-signed cookie (deleted/suspended
  // user) must be cleared through the Route Handler rather than by
  // redirecting straight to /login.
  if (!session) redirect("/api/auth/clear-session");
  // Subscription/billing is a GERENTE concern — a VENDEDOR is bounced to
  // /pos same as Contabilidad/Administración de perfiles, WITHOUT going
  // through requireSession()'s billing-blocked check above (this route must
  // stay reachable for a blocked company's own manager to unblock it).
  if (session.role !== "GERENTE" && !session.isSuperAdmin) redirect("/pos");
  return session;
}

export type BillingInfo = {
  companyName: string;
  isExempt: boolean;
  monthlyFeeUsdCents: number | null;
  // The company's own retail currency (Settings → Moneda) — informational,
  // unrelated to platform billing (which is always USDT via Binance now).
  localCurrencyCode: string;
  // monthlyFeeUsdCents converted to localCurrencyCode at the company's own
  // exchange rate (Configuración → Tasa de cambio) — null unless that rate
  // is enabled and denominated in USD, since the subscription itself is
  // USD-denominated (converting through a EUR-pegged rate would be wrong).
  // Recomputed on every page load, so it tracks the rate's daily updates
  // automatically instead of being stored anywhere.
  monthlyFeeLocalAmount: number | null;
  nextPaymentDueDate: Date | null;
  blocked: boolean;
  paymentInstructions: string | null;
  binanceQrDataUrl: string | null;
  binanceId: string | null;
  pagoMovilBank: string | null;
  pagoMovilPhone: string | null;
  pagoMovilId: string | null;
};

export async function getBillingInfo(): Promise<BillingInfo> {
  const { companyId, companyName } = await requireCompanyUser();

  const [company, settings] = await Promise.all([
    withTenant(companyId, (tx) =>
      tx.company.findUnique({
        where: { id: companyId },
        select: {
          isExempt: true,
          monthlyFeeUsdCents: true,
          nextPaymentDueDate: true,
          localCurrencyCode: true,
          exchangeRate: true,
          exchangeRateEnabled: true,
          referenceCurrency: true,
        },
      })
    ),
    // Global config, not scoped to any company — read directly, same as the
    // rest of the platform-wide settings.
    prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } }),
  ]);

  const isExempt = company?.isExempt ?? false;
  const nextPaymentDueDate = company?.nextPaymentDueDate ?? null;

  const rate = company?.exchangeRate != null ? Number(company.exchangeRate) : null;
  const monthlyFeeUsdCents = company?.monthlyFeeUsdCents ?? null;
  const monthlyFeeLocalAmount =
    company?.exchangeRateEnabled && company.referenceCurrency === "USD" && rate != null && monthlyFeeUsdCents != null
      ? (monthlyFeeUsdCents / 100) * rate
      : null;

  return {
    companyName,
    isExempt,
    monthlyFeeUsdCents,
    localCurrencyCode: company?.localCurrencyCode ?? "VES",
    monthlyFeeLocalAmount,
    nextPaymentDueDate,
    blocked: isCompanyBlocked({ isExempt, nextPaymentDueDate }),
    paymentInstructions: settings?.paymentInstructions ?? null,
    binanceQrDataUrl: settings?.binanceQrDataUrl ?? null,
    binanceId: settings?.binanceId ?? null,
    pagoMovilBank: settings?.pagoMovilBank ?? null,
    pagoMovilPhone: settings?.pagoMovilPhone ?? null,
    pagoMovilId: settings?.pagoMovilId ?? null,
  };
}

export async function listMyPaymentReports() {
  const { companyId } = await requireCompanyUser();
  return withTenant(companyId, (tx) =>
    tx.paymentReport.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      include: { lines: true },
    })
  );
}

// A company user's self-reported claim of having paid the maintenance fee
// externally. Stays PENDING until a super admin reviews it from /admin —
// this alone never changes the company's billing state or unblocks it. The
// proof-of-payment image is no longer collected in-app; the billing page
// tells the company to send it by WhatsApp instead, which is how the super
// admin actually finds out to go review it (see app/billing/page.tsx).
export async function submitPaymentReport(input: unknown): Promise<ActionResult> {
  const { companyId, userId } = await requireCompanyUser();
  const parsed = PaymentReportSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await withTenant(companyId, (tx) =>
    tx.paymentReport.create({
      data: {
        companyId,
        reportedById: userId,
        note: parsed.data.note,
        lines: {
          create: parsed.data.lines.map((line) => ({
            paymentMethod: line.paymentMethod,
            amountUsdCents: line.amount,
            reference: line.reference,
          })),
        },
      },
    })
  );

  revalidatePath("/billing");
  return { success: true };
}
