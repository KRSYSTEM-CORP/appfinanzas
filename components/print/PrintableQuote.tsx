import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";
import { formatDate } from "@/lib/format";
import {
  DEFAULT_CURRENCY_CODE,
  eurCentsToLocal,
  formatCurrencyCents,
  formatLocalCurrency,
  referenceNote,
} from "@/lib/currencies";
import { quoteControlNumberLabel, type QuoteForPdf } from "@/lib/quote-pdf";
import { itemDescription, type DeliveryNoteCompany } from "@/lib/delivery-note";
import { isThermal } from "@/lib/print-paper-sizes";

// Plain HTML/CSS rendering of a Presupuesto for the browser print dialog —
// mirrors PrintableSaleDocument.tsx's structure, separate from the
// jsPDF-generated downloadable PDF (lib/quote-pdf.ts's buildQuotePDF).
export function PrintableQuote({
  quote,
  company,
  rate,
  currencyCode = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled = true,
  referenceCurrency = "EUR",
  useLocalCurrency = true,
  paperSize,
}: {
  quote: QuoteForPdf;
  company: DeliveryNoteCompany;
  rate: number | null;
  currencyCode?: string;
  exchangeRateEnabled?: boolean;
  referenceCurrency?: ReferenceCurrency;
  useLocalCurrency?: boolean;
  paperSize: PrintPaperSize;
}) {
  const thermal = isThermal(paperSize);
  const showLocal = useLocalCurrency && exchangeRateEnabled && rate != null;
  const customerName = `${quote.customerFirstName ?? ""} ${quote.customerLastName ?? ""}`.trim();

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
      <p className="text-center font-bold">PRESUPUESTO</p>
      <p className="text-center text-xs">Nº de control: {quoteControlNumberLabel(quote)}</p>
      <p className="text-center text-xs">Fecha: {formatDate(quote.createdAt)}</p>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="mb-2">
        <p>
          <strong>Cliente:</strong> {customerName || "—"}
        </p>
        {quote.customerPhone && (
          <p>
            <strong>Teléfono:</strong> {quote.customerPhone}
          </p>
        )}
        {quote.customerAddress && (
          <p>
            <strong>Dirección:</strong> {quote.customerAddress}
          </p>
        )}
        {quote.sellerName && (
          <p>
            <strong>Vendedor:</strong> {quote.sellerName}
          </p>
        )}
        {quote.note && (
          <p>
            <strong>Nota:</strong> {quote.note}
          </p>
        )}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      {thermal ? (
        <div className="flex flex-col gap-1">
          {quote.items.map((item, i) => (
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
            {quote.items.map((item, i) => (
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
      <div className="flex justify-between font-bold">
        <span>TOTAL ESTIMADO:</span>
        <span>{money(quote.totalCents)}</span>
      </div>
      {showLocal && (
        <p className="mt-1 text-xs">
          {referenceNote(currencyCode, referenceCurrency)}: {formatCurrencyCents(referenceCurrency, quote.totalCents)}
        </p>
      )}
      <p className="mt-3 text-center text-[10px]">KR POS — Ventas e Inventario</p>
    </div>
  );
}
