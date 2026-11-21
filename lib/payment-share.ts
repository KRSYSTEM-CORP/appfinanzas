// Mensaje predeterminado y enlaces para enviar un pago reportado por WhatsApp o por correo.
// Módulo sin dependencias pesadas: lo usan el servidor (correo, acciones) y el navegador.
import { WHATSAPP_PHONE } from "@/lib/legal";
import { PLANS, parsePlanRequest } from "@/lib/plans";

export type PaymentShareInfo = {
  /** Código corto del reporte, el mismo que ve soporte en el PDF y en el correo. */
  code: string;
  companyName: string;
  /** Qué se paga: «Plan Pyme», «Recarga de 100 créditos»... */
  concept: string;
  amountUsdCents: number;
  methodLabel: string;
  reference: string | null;
  reportedAt: Date;
  reporterName: string | null;
  reporterPhone: string | null;
  /** Enlace firmado al PDF con todos los datos y el comprobante. */
  pdfUrl: string;
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CARD: "Pago Móvil",
  BINANCE: "Binance (USDT)",
  ZELLE: "Zelle",
  PAYPAL: "PayPal",
  TRANSFER: "Transferencia",
  CASH: "Efectivo",
  POS: "Punto de venta",
  OTHER: "Otro",
};

/** Qué se está pagando, según la nota del reporte («Plan solicitado: PYME.»). */
export function paymentConcept(note: string | null | undefined, isLifetime = false): string {
  if (isLifetime) return "Pago único (sin mensualidades)";
  const plan = parsePlanRequest(note);
  return plan ? `Suscripción — Plan ${PLANS[plan].label}` : "Suscripción mensual";
}

/** Código corto legible (últimos 8 caracteres del id), igual que las cotizaciones. */
export function paymentShortCode(reportId: string): string {
  return reportId.slice(-8).toUpperCase();
}

function usd(cents: number): string {
  return `$${(Math.abs(cents) / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(d: Date): string {
  return d.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" });
}

/**
 * Texto que el cliente envía a soporte. Lleva todo lo que soporte necesita para verificar el pago
 * sin preguntar, y el enlace al PDF con el comprobante.
 */
export function buildPaymentMessage(i: PaymentShareInfo): string {
  const lines = [
    "Hola, les envío mi comprobante de pago de KR POS.",
    "",
    `Empresa: ${i.companyName}`,
    `Concepto: ${i.concept}`,
    `Monto: ${usd(i.amountUsdCents)}`,
    `Método: ${i.methodLabel}`,
    `Referencia: ${i.reference?.trim() || "—"}`,
    `Fecha del reporte: ${dateTime(i.reportedAt)}`,
    i.reporterName ? `Reportado por: ${i.reporterName}${i.reporterPhone ? ` (${i.reporterPhone})` : ""}` : null,
    `Código: ${i.code}`,
    "",
    `Ver PDF con el comprobante: ${i.pdfUrl}`,
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}

/** Abre WhatsApp (celular o WhatsApp Web) con el mensaje ya escrito, dirigido al número de soporte. */
export function whatsappPaymentUrl(text: string, phone: string = WHATSAPP_PHONE): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
