import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// Enlace público firmado al PDF de un pago reportado. El comprobante lleva nombres, teléfonos y una
// imagen de un pago, así que, además del id imposible de adivinar, el enlace lleva una firma HMAC con
// AUTH_SECRET: sin la firma, el id solo no sirve. Se genera en el servidor (el secreto nunca llega al navegador).

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET no está configurado");
  return s;
}

export function signPaymentReportId(reportId: string): string {
  return createHmac("sha256", secret()).update(`pago-pdf:${reportId}`).digest("base64url").slice(0, 32);
}

export function verifyPaymentReportToken(reportId: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(signPaymentReportId(reportId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function appBaseUrl(): string {
  return (process.env.APP_URL || "https://krpos.krsystem-corp.com").replace(/\/$/, "");
}

export function paymentPdfUrl(reportId: string): string {
  return `${appBaseUrl()}/api/public/pagos/${reportId}?t=${signPaymentReportId(reportId)}`;
}
