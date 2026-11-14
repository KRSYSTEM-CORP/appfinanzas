"use server";

import { getSession, requireManager } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import {
  getPlan,
  parsePlanRequest,
  planAmountDueUsdCents,
  planRequestNote,
  PLANS,
  type PlanDef,
  type PlanId,
} from "@/lib/plans";
import { getAssistantStatus, listMyCreditRequests } from "@/lib/actions/assistant";
import { getBillingInfo, submitPaymentReport } from "@/lib/actions/billing";
import { computeDiscountCents, couponLabel, isValidCouponCode, normalizeCouponCode, validateCoupon } from "@/lib/coupons";
import type { ActionResult } from "@/lib/types";

export type PlanHistoryItem = {
  id: string;
  title: string;
  createdAt: Date;
  reference: string;
  totalUsdCents: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

export type PlanUsage = {
  plan: PlanDef;
  usedUsers: number;
  usedProducts: number;
  usedBranches: number;
  companyName: string;
  lastReport: { status: "PENDING" | "APPROVED" | "REJECTED"; createdAt: Date } | null;
  creditsLeft: number;
  nextPaymentDueDate: Date | null;
  isExempt: boolean;
  // Hay al menos un pago aprobado: el plan está activo (si no, sigue el período de prueba).
  hasApprovedPayment: boolean;
  // Días que faltan para la fecha de cobro / fin de la prueba (null si no hay fecha).
  daysLeft: number | null;
  monthlyFeeUsdCents: number | null;
  platformRate: number | null;
  pagoMovil: { bank: string | null; phone: string | null; id: string | null; enabled: boolean };
  binance: { id: string | null; qrDataUrl: string | null; enabled: boolean };
  paymentInstructions: string | null;
  history: PlanHistoryItem[];
};

// Resumen de «Mi plan»: plan actual, uso de los límites, datos para pagar y pagos reportados.
// Los conteos son los mismos que usa lib/plan-limits.ts para bloquear al llegar al tope.
export async function getPlanUsage(): Promise<PlanUsage> {
  const session = await requireManager();
  const { companyId } = session;
  const [counts, status, billing, creditRequests] = await Promise.all([
    withTenant(companyId, async (tx) => {
      const [users, products, branches, report, approved, reports] = await Promise.all([
        tx.user.count({ where: { companyId, status: "ACTIVE" } }),
        tx.product.count({ where: { companyId } }),
        tx.branch.count({ where: { companyId, isActive: true } }),
        tx.paymentReport.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { status: true, createdAt: true } }),
        tx.paymentReport.count({ where: { companyId, status: "APPROVED" } }),
        tx.paymentReport.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, status: true, createdAt: true, note: true, lines: { select: { amountUsdCents: true, reference: true, paymentMethod: true } } },
        }),
      ]);
      return { users, products, branches, report, approved, reports };
    }),
    getAssistantStatus(),
    getBillingInfo(),
    listMyCreditRequests(),
  ]);

  const history: PlanHistoryItem[] = [
    ...counts.reports.map((r) => {
      const requested = parsePlanRequest(r.note);
      return {
        id: r.id,
        title: `${requested ? PLANS[requested].label : "Mensualidad"} · ${
          r.lines[0]?.paymentMethod === "BINANCE" ? "Binance (USDT)" : r.lines[0]?.paymentMethod === "CARD" ? "Pago Móvil" : "Pago"
        }`,
        createdAt: r.createdAt,
        reference: r.lines.map((l) => l.reference).filter((x): x is string => !!x).join(", "),
        totalUsdCents: r.lines.reduce((s, l) => s + l.amountUsdCents, 0),
        status: r.status as PlanHistoryItem["status"],
      };
    }),
    ...creditRequests.map((c) => ({
      id: c.id,
      title: `Recarga de ${c.credits} créditos`,
      createdAt: c.createdAt,
      reference: c.reference,
      totalUsdCents: c.priceCents,
      status: c.status as PlanHistoryItem["status"],
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return {
    plan: getPlan(session.plan),
    usedUsers: counts.users,
    usedProducts: counts.products,
    usedBranches: counts.branches,
    companyName: session.companyName,
    lastReport: counts.report,
    creditsLeft: status.creditsLeft,
    nextPaymentDueDate: session.nextPaymentDueDate,
    isExempt: session.isExempt,
    hasApprovedPayment: counts.approved > 0,
    daysLeft: session.nextPaymentDueDate
      ? Math.max(0, Math.ceil((session.nextPaymentDueDate.getTime() - Date.now()) / 86_400_000))
      : null,
    monthlyFeeUsdCents: billing.monthlyFeeUsdCents,
    platformRate: billing.platformRate,
    pagoMovil: { bank: billing.pagoMovilBank, phone: billing.pagoMovilPhone, id: billing.pagoMovilId, enabled: billing.pagoMovilEnabled },
    binance: { id: billing.binanceId, qrDataUrl: billing.binanceQrDataUrl, enabled: billing.binanceEnabled },
    paymentInstructions: billing.paymentInstructions,
    history,
  };
}

type PlanCouponPreview =
  | { success: true; code: string; label: string; discountCents: number; baseCents: number; totalCents: number }
  | { success: false; error: string };

// Monto de lista a cobrar por un plan (siempre lo calcula el servidor).
async function planDueCents(companyId: string, selected: PlanId) {
  const info = await getBillingInfo();
  const approved = await withTenant(companyId, (tx) => tx.paymentReport.count({ where: { companyId, status: "APPROVED" } }));
  const due = planAmountDueUsdCents({ selected, current: info.plan, monthlyFeeUsdCents: info.monthlyFeeUsdCents, hasApprovedPayment: approved > 0 });
  return { info, due };
}

// Busca y valida un cupón para esta empresa y plan; el descuento nunca deja el pago en cero.
async function checkPlanCoupon(companyId: string, plan: PlanId, rawCode: string, dueCents: number) {
  const code = normalizeCouponCode(rawCode);
  if (!isValidCouponCode(code)) return { ok: false as const, error: "Escribe un código de cupón válido." };
  const found = await withTenant(companyId, async (tx) => {
    const coupon = await tx.platformCoupon.findUnique({ where: { code } });
    const redeemed = coupon ? (await tx.platformCouponRedemption.count({ where: { couponId: coupon.id, companyId } })) > 0 : false;
    return { coupon, redeemed };
  });
  const check = validateCoupon(found.coupon, { companyId, plan, now: new Date(), alreadyRedeemedByCompany: found.redeemed });
  if (!check.ok || !found.coupon) return { ok: false as const, error: check.ok ? "Ese cupón no existe. Revisa el código." : check.error };
  const discountCents = Math.min(computeDiscountCents(found.coupon, dueCents), Math.max(0, dueCents - 1));
  return { ok: true as const, coupon: found.coupon, code, discountCents };
}

// Vista previa del cupón en el paso de pago de «Mi plan» (no reserva nada).
export async function previewPlanCoupon(input: { plan: string; code: string }): Promise<PlanCouponPreview> {
  const session = await requireManager();
  if (!(input.plan in PLANS)) return { success: false, error: "Elige un plan válido." };
  const { due } = await planDueCents(session.companyId, input.plan as PlanId);
  const r = await checkPlanCoupon(session.companyId, input.plan as PlanId, input.code, due);
  if (!r.ok) return { success: false, error: r.error };
  return { success: true, code: r.code, label: couponLabel(r.coupon), discountCents: r.discountCents, baseCents: due, totalCents: due - r.discountCents };
}

// El cupón se RESERVA al reportar el pago (cuenta como uso) y se libera si el superadmin
// rechaza ese reporte (rejectPaymentReport). Una empresa solo puede usar cada cupón una vez
// (índice único cupón+empresa) y el tope total de usos se aplica en la misma sentencia SQL.
async function reserveCoupon(companyId: string, couponId: string, discountCents: number): Promise<string | null> {
  try {
    await withTenant(companyId, async (tx) => {
      const n = await tx.$executeRaw`UPDATE "PlatformCoupon" SET "usedCount" = "usedCount" + 1 WHERE "id" = ${couponId} AND "active" = true AND ("maxUses" IS NULL OR "usedCount" < "maxUses")`;
      if (n === 0) throw new Error("COUPON_EXHAUSTED");
      await tx.platformCouponRedemption.create({ data: { couponId, companyId, discountUsdCents: discountCents } });
    });
    return null;
  } catch (e) {
    if (e instanceof Error && e.message === "COUPON_EXHAUSTED") return "Ese cupón ya se usó el máximo de veces.";
    if ((e as { code?: string }).code === "P2002") return "Tu empresa ya usó ese cupón.";
    throw e;
  }
}

async function releaseCoupon(companyId: string, couponId: string): Promise<void> {
  await withTenant(companyId, async (tx) => {
    const del = await tx.platformCouponRedemption.deleteMany({ where: { couponId, companyId, paymentReportId: null } });
    if (del.count > 0) await tx.platformCoupon.update({ where: { id: couponId }, data: { usedCount: { decrement: 1 } } });
  });
}

// Reporta el pago de un plan elegido en «Mi plan». El monto (y el descuento del cupón) lo calcula
// el servidor (nunca el cliente) y el plan pedido queda en la nota; se activa cuando KR System aprueba.
export async function reportPlanPayment(input: {
  plan: string;
  method: string;
  reference: string;
  name: string;
  phone: string;
  email: string;
  proofImageDataUrl: string;
  coupon?: string;
}): Promise<ActionResult> {
  const session = await requireManager();
  if (!(input.plan in PLANS)) return { success: false, error: "Elige un plan válido." };
  if (input.method !== "CARD" && input.method !== "BINANCE") return { success: false, error: "Elige un método de pago válido." };
  const selected = input.plan as PlanId;
  const { info, due } = await planDueCents(session.companyId, selected);
  if (input.method === "CARD" ? !info.pagoMovilEnabled : !info.binanceEnabled) {
    return { success: false, error: "Ese método de pago no está disponible por ahora. Elige otro." };
  }

  let amountCents = due;
  let couponId: string | null = null;
  if (input.coupon?.trim()) {
    const c = await checkPlanCoupon(session.companyId, selected, input.coupon, due);
    if (!c.ok) return { success: false, error: c.error };
    const reserved = await reserveCoupon(session.companyId, c.coupon.id, c.discountCents);
    if (reserved) return { success: false, error: reserved };
    couponId = c.coupon.id;
    amountCents = due - c.discountCents;
  }

  const result = await submitPaymentReport({
    lines: [{ paymentMethod: input.method, amount: (amountCents / 100).toFixed(2), reference: input.reference }],
    reporterName: input.name,
    reporterPhone: input.phone,
    reporterEmail: input.email,
    proofImageDataUrl: input.proofImageDataUrl,
    note: planRequestNote(selected),
  });

  if (couponId) {
    if (!result.success) {
      await releaseCoupon(session.companyId, couponId);
    } else {
      // Enlaza el canje con el reporte recién creado para poder liberarlo si se rechaza.
      await withTenant(session.companyId, async (tx) => {
        const report = await tx.paymentReport.findFirst({
          where: { companyId: session.companyId, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (report) await tx.platformCouponRedemption.updateMany({ where: { couponId, companyId: session.companyId, paymentReportId: null }, data: { paymentReportId: report.id } });
      });
    }
  }
  return result;
}

// Primera elección de plan al crear la cuenta (pantalla /choose-plan). No cobra
// nada: los 15 días gratis siguen corriendo y el pago se hace al terminar.
export async function chooseInitialPlan(plan: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== "GERENTE") return { success: false, error: "No tienes permiso para elegir el plan." };
  if (!session.needsPlanChoice) return { success: false, error: "Ya elegiste tu plan. Para cambiarlo escríbenos por soporte." };
  if (!(plan in PLANS)) return { success: false, error: "Elige un plan válido." };
  const def = PLANS[plan as PlanId];
  await withTenant(session.companyId, (tx) =>
    tx.company.update({
      where: { id: session.companyId },
      data: { plan: def.id, monthlyFeeUsdCents: def.priceUsdCents, planChosen: true },
    })
  );
  return { success: true };
}
