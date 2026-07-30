import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";
import { PAYMENT_METHOD_LABELS, formatDate } from "@/lib/format";
import {
  DEFAULT_CURRENCY_CODE,
  eurCentsToLocal,
  formatCurrencyCents,
  formatLocalCurrency,
  referenceNote,
} from "@/lib/currencies";
import { legacyCurrencyForPayment } from "@/lib/payment-currency";
import {
  controlNumberLabel,
  receiptControlNumberLabel,
  invoiceNumberLabel,
  itemDescription,
  resolvePaymentLines,
  type DeliveryNoteCompany,
  type DeliveryNoteSale,
} from "@/lib/delivery-note";
import { isThermal } from "@/lib/print-paper-sizes";

// Plain HTML/CSS rendering of a Nota de Entrega / Recibo de Pago for the
// browser print dialog (see PrintDialog.tsx) — a separate path from the
// jsPDF-generated downloadable PDF (lib/delivery-note.ts's
// buildDeliveryNotePDF/buildPaymentReceiptPDF), reusing the same data shape
// and helpers so the two stay in sync.
export function PrintableSaleDocument({
  sale,
  company,
  rate,
  currencyCode = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled = true,
  referenceCurrency = "EUR",
  variant,
  paperSize,
}: {
  sale: DeliveryNoteSale;
  company: DeliveryNoteCompany;
  rate: number | null;
  currencyCode?: string;
  exchangeRateEnabled?: boolean;
  referenceCurrency?: ReferenceCurrency;
  variant: "delivery-note" | "receipt" | "invoice";
  paperSize: PrintPaperSize;
}) {
  const thermal = isThermal(paperSize);
  const showLocal = exchangeRateEnabled && rate != null;
  const payments = resolvePaymentLines(sale, referenceCurrency);
  const title =
    variant === "delivery-note" ? "NOTA DE ENTREGA" : variant === "invoice" ? "FACTURA" : "RECIBO DE PAGO";
  const controlLabel =
    variant === "delivery-note"
      ? controlNumberLabel(sale)
      : variant === "invoice"
        ? invoiceNumberLabel(sale)
        : receiptControlNumberLabel(sale);
  const customerName = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.trim();

  const money = (cents: number) =>
    showLocal
      ? formatLocalCurrency(eurCentsToLocal(cents, rate!), currencyCode)
      : formatCurrencyCents(referenceCurrency, cents);

  return (
    <div className={thermal ? "font-mono text-[11px] leading-snug" : "font-sans text-sm"}>
      <div className="mb-2 text-center">
        {company.logoDataUrl && !thermal && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logoDataUrl} alt="" className="mx-auto mb-1 h-10 object-contain" />
        )}
        <p className="font-bold">{company.name}</p>
        {company.fiscalLegalName && <p className="text-xs">{company.fiscalLegalName}</p>}
        {company.fiscalRif && <p className="text-xs">RIF: {company.fiscalRif}</p>}
        {company.fiscalAddress && <p className="text-xs">{company.fiscalAddress}</p>}
        {company.fiscalPhone && <p className="text-xs">Tel: {company.fiscalPhone}</p>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center font-bold">{title}</p>
      <p className="text-center text-xs">Nº de control: {controlLabel}</p>
      {variant === "receipt" && (
        <p className="text-center text-xs">Nota de entrega Nº: {controlNumberLabel(sale)}</p>
      )}
      <p className="text-center text-xs">Fecha: {formatDate(sale.createdAt)}</p>
      {variant === "receipt" && sale.paidAt && (
        <p className="text-center text-xs">Fecha de pago: {formatDate(sale.paidAt)}</p>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="mb-2">
        <p>
          <strong>Cliente:</strong> {customerName || "—"}
        </p>
        {sale.customerRif && (
          <p>
            <strong>RIF/Cédula:</strong> {sale.customerRif}
          </p>
        )}
        {sale.customerPhone && (
          <p>
            <strong>Teléfono:</strong> {sale.customerPhone}
          </p>
        )}
        {sale.customerAddress && (
          <p>
            <strong>Dirección:</strong> {sale.customerAddress}
          </p>
        )}
        {sale.sellerName && (
          <p>
            <strong>Vendedor:</strong> {sale.sellerName}
          </p>
        )}
        {variant !== "receipt" && sale.note && (
          <p>
            <strong>Nota:</strong> {sale.note}
          </p>
        )}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {thermal ? (
        <div className="flex flex-col gap-1">
          {sale.items.map((item, i) => (
            <div key={i}>
              <p>
                {item.quantity} x {itemDescription(item)}
              </p>
              <p className="text-[10px] text-gray-600">{money(item.unitPriceCents)} c/u</p>
              <p className="text-right font-medium">{money(item.subtotalCents)}</p>
            </div>
          ))}
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 text-left">Cant.</th>
              <th className="py-1 text-left">Descripción</th>
              <th className="py-1 text-right">Precio unit.</th>
              <th className="py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, i) => (
              <tr key={i} className="border-b border-gray-300">
                <td className="py-1">{item.quantity}</td>
                <td className="py-1">{itemDescription(item)}</td>
                <td className="py-1 text-right">{money(item.unitPriceCents)}</td>
                <td className="py-1 text-right">{money(item.subtotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      {sale.paymentStatus === "CREDIT" ? (
        <p className="text-center font-bold">PAGO PENDIENTE</p>
      ) : (
        <div className="mb-2">
          {payments.length <= 1 ? (
            <>
              <p>Método de pago: {payments[0] ? PAYMENT_METHOD_LABELS[payments[0].paymentMethod] : "—"}</p>
              {payments[0]?.reference && <p>Referencia: {payments[0].reference}</p>}
            </>
          ) : (
            <>
              <p>Métodos de pago:</p>
              {payments.map((p, i) => (
                <p key={i}>
                  • {PAYMENT_METHOD_LABELS[p.paymentMethod]}:{" "}
                  {formatCurrencyCents(
                    p.currencyCode ?? legacyCurrencyForPayment(p.paymentMethod, referenceCurrency),
                    p.amountCurrencyCents ?? p.amountEurCents
                  )}
                  {p.reference ? ` (${p.reference})` : ""}
                  {(p.createdAt || p.exchangeRate != null) && (
                    <span className="block text-xs text-gray-600 ml-3">
                      {[p.createdAt ? formatDate(p.createdAt) : null, p.exchangeRate != null ? `Tasa ${formatLocalCurrency(p.exchangeRate, currencyCode)}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </p>
              ))}
            </>
          )}
        </div>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      {(sale.taxCents ?? 0) > 0 && (
        <>
          <div className="flex justify-between">
            <span>Base imponible:</span>
            <span>{money(sale.baseImponibleCents ?? 0)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>IVA:</span>
            <span>{money(sale.taxCents ?? 0)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between font-bold">
        <span>{variant === "receipt" ? "TOTAL PAGADO:" : "TOTAL A CANCELAR:"}</span>
        <span>{money(sale.totalCents)}</span>
      </div>
      {showLocal && (
        <p className="mt-1 text-xs">
          {referenceNote(currencyCode, referenceCurrency)}: {formatCurrencyCents(referenceCurrency, sale.totalCents)}
        </p>
      )}
      <p className="mt-3 text-center text-[10px]">App Finanzas — Ventas e Inventario</p>
    </div>
  );
}
