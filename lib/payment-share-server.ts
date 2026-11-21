import "server-only";
import { PAYMENT_METHOD_LABEL, paymentConcept, paymentShortCode, type PaymentShareInfo } from "@/lib/payment-share";
import { paymentPdfUrl } from "@/lib/payment-link";

export type ReportForShare = {
  id: string;
  createdAt: Date;
  note: string | null;
  isLifetime: boolean;
  reporterName: string | null;
  reporterPhone: string | null;
  lines: { paymentMethod: string; amountUsdCents: number; reference: string | null }[];
};

// Arma los datos del mensaje/correo de un pago reportado, con el enlace firmado al PDF.
export function shareInfoFromReport(r: ReportForShare, companyName: string): PaymentShareInfo {
  const first = r.lines[0];
  return {
    code: paymentShortCode(r.id),
    companyName,
    concept: paymentConcept(r.note, r.isLifetime),
    amountUsdCents: r.lines.reduce((s, l) => s + l.amountUsdCents, 0),
    methodLabel: first ? (PAYMENT_METHOD_LABEL[first.paymentMethod] ?? first.paymentMethod) : "—",
    reference: r.lines.map((l) => l.reference).filter(Boolean).join(", ") || null,
    reportedAt: r.createdAt,
    reporterName: r.reporterName,
    reporterPhone: r.reporterPhone,
    pdfUrl: paymentPdfUrl(r.id),
  };
}
