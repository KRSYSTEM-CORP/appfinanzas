import "server-only";
import { withTenant } from "@/lib/tenant-db";
import { paymentConcept } from "@/lib/payment-share";

export type PaymentBannerState = {
  reportId: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  concept: string;
  amountUsdCents: number;
  /** ISO; solo cuando ya fue revisado. */
  reviewedAt: string | null;
};

const RECENT_MS = 7 * 24 * 3600 * 1000;

// Estado del último pago reportado por la empresa para el aviso del encabezado: el pendiente, o el
// último revisado en los últimos 7 días (para celebrar la aprobación aunque la persona no estuviera conectada).
export async function getPaymentBannerState(companyId: string): Promise<PaymentBannerState | null> {
  const since = new Date(Date.now() - RECENT_MS);
  const r = await withTenant(companyId, (tx) =>
    tx.paymentReport.findFirst({
      where: { companyId, OR: [{ status: "PENDING" }, { reviewedAt: { gte: since } }] },
      orderBy: [{ createdAt: "desc" }],
      include: { lines: true },
    })
  );
  if (!r) return null;
  return {
    reportId: r.id,
    status: r.status,
    concept: paymentConcept(r.note, r.isLifetime),
    amountUsdCents: r.lines.reduce((s, l) => s + l.amountUsdCents, 0),
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}
