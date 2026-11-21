"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { checkRateLimit, recordFailedAttempt } from "@/lib/rate-limit";
import { sendPaymentReportEmail } from "@/lib/email";
import { shareInfoFromReport } from "@/lib/payment-share-server";
import { buildPaymentMessage, whatsappPaymentUrl } from "@/lib/payment-share";
import { PAYMENTS_NOTIFY_EMAIL } from "@/lib/legal";

// Estas acciones se usan también desde /billing, a donde llega una empresa bloqueada por pago, así que
// (igual que lib/actions/billing.ts y plan.ts) NO usan requireSession(): no mandan a /blocked.
async function requireOwner() {
  const session = await getSession();
  if (!session) redirect("/api/auth/clear-session");
  if (session.locked) redirect("/lock");
  if (session.role !== "GERENTE" && !session.isSuperAdmin) redirect("/pos");
  return session;
}

export type PaymentShare = {
  reportId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  code: string;
  concept: string;
  amountUsdCents: number;
  methodLabel: string;
  reference: string | null;
  reportedAt: string;
  text: string;
  whatsappUrl: string;
  pdfUrl: string;
};

async function loadReport(companyId: string, reportId: string) {
  return withTenant(companyId, (tx) =>
    tx.paymentReport.findFirst({ where: { id: reportId, companyId }, include: { lines: true } })
  );
}

// Mensaje predeterminado, enlace de WhatsApp y enlace firmado al PDF de un pago reportado por MI empresa.
export async function getPaymentShare(reportId: string): Promise<PaymentShare | null> {
  const session = await requireOwner();
  const report = await loadReport(session.companyId, reportId);
  if (!report) return null;
  const info = shareInfoFromReport(report, session.companyName);
  const text = buildPaymentMessage(info);
  return {
    reportId: report.id,
    status: report.status,
    code: info.code,
    concept: info.concept,
    amountUsdCents: info.amountUsdCents,
    methodLabel: info.methodLabel,
    reference: info.reference,
    reportedAt: report.createdAt.toISOString(),
    text,
    whatsappUrl: whatsappPaymentUrl(text),
    pdfUrl: info.pdfUrl,
  };
}

// Reenvía al buzón de pagos el aviso de un reporte que sigue pendiente (máx. 3 cada 10 minutos).
export async function resendPaymentReportEmail(reportId: string): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireOwner();
  const rl = await checkRateLimit("payment-resend", session.companyId, 3, 10 * 60_000);
  if (!rl.allowed) return { success: false, error: `Ya lo reenviaste hace poco. Intenta de nuevo en ${rl.retryAfterMinutes} minutos.` };

  const report = await loadReport(session.companyId, reportId);
  if (!report) return { success: false, error: "No encontramos ese pago." };
  if (report.status !== "PENDING") return { success: false, error: "Ese pago ya fue revisado." };

  await recordFailedAttempt("payment-resend", session.companyId);
  try {
    await sendPaymentReportEmail(process.env.PAYMENTS_NOTIFY_EMAIL || PAYMENTS_NOTIFY_EMAIL, {
      share: shareInfoFromReport(report, session.companyName),
      reporterEmail: report.reporterEmail,
      proofImageDataUrl: report.proofImageDataUrl,
      isResend: true,
    });
  } catch (err) {
    console.error("[payment-share] resend failed:", err);
    return { success: false, error: "No pudimos reenviar el correo ahora. Envíalo por WhatsApp." };
  }
  return { success: true };
}
