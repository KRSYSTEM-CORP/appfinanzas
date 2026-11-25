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
  // Una sola consulta (reporte más reciente y suma de sus líneas) en vez de reporte + líneas.
  const [r] = await withTenant(companyId, (tx) =>
    tx.$queryRaw<{ id: string; status: "PENDING" | "APPROVED" | "REJECTED"; note: string | null; isLifetime: boolean; reviewedAt: Date | null; total: number }[]>`
      SELECT r."id", r."status"::text AS "status", r."note", r."isLifetime", r."reviewedAt",
             COALESCE((SELECT SUM(l."amountUsdCents") FROM "PaymentReportLine" l WHERE l."paymentReportId" = r."id"), 0)::int AS "total"
      FROM "PaymentReport" r
      WHERE r."companyId" = ${companyId} AND (r."status"::text = 'PENDING' OR r."reviewedAt" >= ${since})
      ORDER BY r."createdAt" DESC
      LIMIT 1
    `
  );
  return {
    reportId: r.id,
    status: r.status,
    concept: paymentConcept(r.note, r.isLifetime),
    amountUsdCents: r.total,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
  };
}
