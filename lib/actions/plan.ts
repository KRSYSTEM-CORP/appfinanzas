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
  pagoMovil: { bank: string | null; phone: string | null; id: string | null };
  binance: { id: string | null; qrDataUrl: string | null };
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
    pagoMovil: { bank: billing.pagoMovilBank, phone: billing.pagoMovilPhone, id: billing.pagoMovilId },
    binance: { id: billing.binanceId, qrDataUrl: billing.binanceQrDataUrl },
    paymentInstructions: billing.paymentInstructions,
    history,
  };
}

// Reporta el pago de un plan elegido en «Mi plan». El monto lo calcula el servidor
// (nunca el cliente) y el plan pedido queda en la nota; se activa cuando KR System aprueba.
export async function reportPlanPayment(input: {
  plan: string;
  method: string;
  reference: string;
  name: string;
  phone: string;
  email: string;
  proofImageDataUrl: string;
}): Promise<ActionResult> {
  const session = await requireManager();
  if (!(input.plan in PLANS)) return { success: false, error: "Elige un plan válido." };
  if (input.method !== "CARD" && input.method !== "BINANCE") return { success: false, error: "Elige un método de pago válido." };
  const selected = input.plan as PlanId;
  const info = await getBillingInfo();
  const approved = await withTenant(session.companyId, (tx) =>
    tx.paymentReport.count({ where: { companyId: session.companyId, status: "APPROVED" } })
  );
  const due = planAmountDueUsdCents({
    selected,
    current: info.plan,
    monthlyFeeUsdCents: info.monthlyFeeUsdCents,
    hasApprovedPayment: approved > 0,
  });
  return submitPaymentReport({
    lines: [{ paymentMethod: input.method, amount: (due / 100).toFixed(2), reference: input.reference }],
    reporterName: input.name,
    reporterPhone: input.phone,
    reporterEmail: input.email,
    proofImageDataUrl: input.proofImageDataUrl,
    lifetime: false,
    note: planRequestNote(selected),
  });
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
