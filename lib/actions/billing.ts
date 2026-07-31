"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { isCompanyBlocked, PLATFORM_SETTINGS_ID } from "@/lib/billing";
import { createBinancePayOrder } from "@/lib/binance-pay";
import { PaymentReportSchema } from "@/lib/validations";
import type { ActionResult } from "@/lib/types";
import type { BinancePayOrderStatus } from "@prisma/client";

// This whole file deliberately uses getSession() instead of requireSession():
// /billing is exactly the page a billing-blocked company needs to reach to
// report a payment and get itself unblocked, so these actions must never
// trigger the /blocked redirect the way most other actions do.
async function requireCompanyUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export type BillingInfo = {
  companyName: string;
  isExempt: boolean;
  monthlyFeeUsdCents: number | null;
  // Platform-wide rate (not per-company) — only meaningful for VES
  // companies previewing what a report would come out to in bolívares
  // (Pago Móvil); the headline "cost" shown is always the USD amount.
  billingExchangeRate: number | null;
  // The company's own retail currency (Settings → Moneda) — used here just
  // to decide whether the Bs preview above is relevant at all.
  localCurrencyCode: string;
  nextPaymentDueDate: Date | null;
  blocked: boolean;
  paymentInstructions: string | null;
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
        },
      })
    ),
    // Global config, not scoped to any company — read directly, same as the
    // rest of the platform-wide settings.
    prisma.platformSettings.findUnique({ where: { id: PLATFORM_SETTINGS_ID } }),
  ]);

  const isExempt = company?.isExempt ?? false;
  const nextPaymentDueDate = company?.nextPaymentDueDate ?? null;

  return {
    companyName,
    isExempt,
    monthlyFeeUsdCents: company?.monthlyFeeUsdCents ?? null,
    billingExchangeRate: settings?.billingExchangeRate != null ? Number(settings.billingExchangeRate) : null,
    localCurrencyCode: company?.localCurrencyCode ?? "VES",
    nextPaymentDueDate,
    blocked: isCompanyBlocked({ isExempt, nextPaymentDueDate }),
    paymentInstructions: settings?.paymentInstructions ?? null,
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
// externally, with a required proof-of-payment image. Stays PENDING until a
// super admin reviews it from /admin — this alone never changes the
// company's billing state or unblocks it.
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
        proofImageDataUrl: parsed.data.proofImageDataUrl,
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

export type BinancePayCheckoutResult =
  | { success: true; orderId: string; checkoutUrl: string; qrcodeLink: string }
  | { success: false; error: string };

export type BillingPlan = "MONTHLY" | "ANNUAL";

// Creates a Binance Pay checkout for the company's current maintenance-fee
// cycle — ANNUAL charges 12× the monthly fee up front; the extra 2 free
// months from prepaying a full year aren't charged for, they're just extra
// time credited once the webhook sees this amount (see
// monthsCoveredWithBonus in lib/billing.ts). Unlike submitPaymentReport,
// this needs no admin review — once the customer actually pays, Binance
// calls app/api/webhooks/binance-pay/route.ts, which marks the order PAID
// and advances nextPaymentDueDate on its own.
export async function createBinancePayCheckout(plan: BillingPlan = "MONTHLY"): Promise<BinancePayCheckoutResult> {
  const { companyId } = await requireCompanyUser();

  const company = await withTenant(companyId, (tx) =>
    tx.company.findUnique({ where: { id: companyId }, select: { name: true, monthlyFeeUsdCents: true } })
  );
  if (!company?.monthlyFeeUsdCents) {
    return { success: false, error: "Todavía no tienes un ciclo de cobro configurado." };
  }

  const amountUsdCents = plan === "ANNUAL" ? company.monthlyFeeUsdCents * 12 : company.monthlyFeeUsdCents;
  const merchantTradeNo = `KYRA-${companyId}-${Date.now()}`;

  let order;
  try {
    order = await createBinancePayOrder({
      merchantTradeNo,
      amountUsdCents,
      description:
        plan === "ANNUAL"
          ? `Suscripción anual (12 meses + 2 de regalo) KR System — ${company.name}`
          : `Suscripción mensual KR System — ${company.name}`,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "BINANCE_PAY_NOT_CONFIGURED") {
      return { success: false, error: "El pago automático con Binance Pay todavía no está habilitado." };
    }
    return { success: false, error: "No se pudo crear el pago con Binance Pay. Intenta de nuevo." };
  }

  const saved = await withTenant(companyId, (tx) =>
    tx.binancePayOrder.create({
      data: {
        companyId,
        merchantTradeNo,
        prepayId: order.prepayId,
        amountUsdCents,
        checkoutUrl: order.checkoutUrl,
        qrcodeLink: order.qrcodeLink,
      },
    })
  );

  return { success: true, orderId: saved.id, checkoutUrl: order.checkoutUrl, qrcodeLink: order.qrcodeLink };
}

// Polled by the client while a Binance Pay checkout is open — once the
// webhook marks it PAID, the UI can refresh the page to show the new due
// date without the customer or an admin doing anything else.
export async function getBinancePayOrderStatus(orderId: string): Promise<BinancePayOrderStatus | null> {
  const { companyId } = await requireCompanyUser();
  const order = await withTenant(companyId, (tx) =>
    tx.binancePayOrder.findFirst({ where: { id: orderId, companyId }, select: { status: true } })
  );
  return order?.status ?? null;
}
