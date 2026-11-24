// Pure label/payment helpers split out of delivery-note.ts so client components
// can import them WITHOUT pulling jspdf + autotable (~400 KB) into their
// bundle. delivery-note.ts re-exports everything here, so existing imports
// keep working.
import { formatLocalCurrency } from "@/lib/currencies";
import { legacyCurrencyForPayment } from "@/lib/payment-currency";
import { paidAmount } from "@/lib/money-primary";
import type { ReferenceCurrency } from "@prisma/client";
import type { DeliveryNoteSale, SalePaymentLine } from "@/lib/delivery-note";

export function controlNumberLabel(sale: Pick<DeliveryNoteSale, "id" | "controlNumber">): string {
  return sale.controlNumber != null
    ? String(sale.controlNumber).padStart(6, "0")
    : sale.id.slice(-8).toUpperCase();
}

// The Recibo de Pago's own progressive sequence — independent of
// controlNumber above (the Nota de Entrega's). Only set once a credit sale's
// debt is actually collected (see registerPayment).
export function receiptControlNumberLabel(sale: Pick<DeliveryNoteSale, "id" | "receiptControlNumber">): string {
  return sale.receiptControlNumber != null
    ? String(sale.receiptControlNumber).padStart(6, "0")
    : sale.id.slice(-8).toUpperCase();
}

// The Factura's own progressive sequence — independent of controlNumber and
// receiptControlNumber. Only assigned the moment someone actually requests a
// Factura for this sale (see getOrCreateInvoiceNumber in
// lib/actions/sales.ts) — a placeholder ahead of real SENIAT fiscal-machine
// integration, not a fiscally-compliant invoice number yet.
export function invoiceNumberLabel(sale: Pick<DeliveryNoteSale, "id" | "invoiceNumber">): string {
  return sale.invoiceNumber != null
    ? String(sale.invoiceNumber).padStart(6, "0")
    : sale.id.slice(-8).toUpperCase();
}

// Products can share the same name but differ by category — append it to
// the printed description so a document never leaves it ambiguous which one
// was actually sold.
export function itemDescription(item: { productName: string; category?: string | null }): string {
  return item.category ? `${item.productName} (${item.category})` : item.productName;
}

// Resolves the payment breakdown to render: the actual split-payment rows if
// present, otherwise falls back to the sale's own singular fields (older
// sales, created before split payments existed).
export function resolvePaymentLines(sale: DeliveryNoteSale, referenceCurrency: ReferenceCurrency): SalePaymentLine[] {
  if (sale.payments && sale.payments.length > 0) return sale.payments;
  if (sale.paymentMethod) {
    return [
      {
        paymentMethod: sale.paymentMethod,
        amountEurCents: sale.totalCents,
        currencyCode: legacyCurrencyForPayment(sale.paymentMethod, referenceCurrency),
        amountCurrencyCents: sale.totalCents,
        reference: sale.paymentReference,
      },
    ];
  }
  return [];
}

// Un solo pago: si se cobró en una moneda distinta a la local (p. ej. Efectivo $
// con totales en Bs), el documento debe decir cuánto se cobró en esa moneda.
export function singlePaymentPaidLine(
  p: SalePaymentLine | undefined,
  referenceCurrency: ReferenceCurrency,
  localCurrencyCode: string
): string | null {
  if (!p) return null;
  const currency = p.currencyCode ?? legacyCurrencyForPayment(p.paymentMethod, referenceCurrency);
  if (currency === referenceCurrency) return null;
  const paid = paidAmount({ amountEurCents: p.amountEurCents, amountCurrencyCents: p.amountCurrencyCents ?? p.amountEurCents, currencyCode: currency }, referenceCurrency);
  const rate = p.exchangeRate != null ? ` · Tasa ${formatLocalCurrency(p.exchangeRate, localCurrencyCode)}` : "";
  return `Cobrado: ${paid.primary}${paid.secondary ? ` (${paid.secondary})` : ""}${rate}`;
}
