import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";
import { PAYMENT_METHOD_LABELS, formatDate, formatDateOnly } from "@/lib/format";
import { DEFAULT_CURRENCY_CODE, eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { CashClosingSummary } from "@/lib/actions/cash-closing";
import { isThermal } from "@/lib/print-paper-sizes";

// Plain HTML/CSS rendering of a Cierre de Caja for the browser print dialog
// (see PrintDialog.tsx) — mirrors PrintableSaleDocument.tsx's structure,
// separate from the jsPDF-generated downloadable PDF (lib/cash-closing-pdf.ts).
export function PrintableCashClosing({
  summary,
  company,
  branchName,
  rate,
  currencyCode = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled = true,
  referenceCurrency = "EUR",
  paperSize,
}: {
  summary: CashClosingSummary;
  company: DeliveryNoteCompany;
  branchName: string | null;
  rate: number | null;
  currencyCode?: string;
  exchangeRateEnabled?: boolean;
  referenceCurrency?: ReferenceCurrency;
  paperSize: PrintPaperSize;
}) {
  const thermal = isThermal(paperSize);
  const showLocal = exchangeRateEnabled && rate != null;

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
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center font-bold">CORTE Z · CIERRE DE CAJA</p>
      <p className="text-center text-xs">Fecha: {formatDateOnly(summary.date)}</p>
      {branchName && <p className="text-center text-xs">Sucursal: {branchName}</p>}
      <div className="my-2 border-t border-dashed border-black" />

      {summary.closed ? (
        <p>
          <strong>Cerrada</strong> — {formatDate(summary.closed.closedAt)}
          {summary.closed.note && (
            <>
              <br />
              Nota: {summary.closed.note}
            </>
          )}
        </p>
      ) : (
        <p>
          <strong>Caja abierta</strong> — todavía no se ha cerrado este día
        </p>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between">
        <span>Total vendido:</span>
        <span className="font-bold">{money(summary.totalCents)}</span>
      </div>
      <div className="flex justify-between">
        <span>Nº de ventas:</span>
        <span>{summary.salesCount}</span>
      </div>
      <div className="flex justify-between">
        <span>Pagadas ({summary.paidCount}):</span>
        <span>{money(summary.paidCents)}</span>
      </div>
      <div className="flex justify-between">
        <span>A crédito ({summary.creditCount}):</span>
        <span>{money(summary.creditCents)}</span>
      </div>

      <div className="my-2 border-t border-dashed border-black" />
      <p className="font-bold">Caja Chica</p>
      <div className="flex justify-between">
        <span>Apertura:</span>
        <span>{money(summary.openingCents ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span>Ventas en efectivo:</span>
        <span>{money(summary.cashSalesCents)}</span>
      </div>
      {summary.outflows.map((o) => (
        <div key={o.id} className="flex justify-between">
          <span>Salida: {o.concept}</span>
          <span>−{money(o.amountCents)}</span>
        </div>
      ))}
      <div className="flex justify-between font-bold">
        <span>Efectivo esperado:</span>
        <span>{money(summary.expectedCashCents)}</span>
      </div>

      {summary.byMethod.length > 0 && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <p className="font-bold">Por método de pago</p>
          {summary.byMethod.map((m) => (
            <div key={m.paymentMethod} className="flex justify-between">
              <span>{PAYMENT_METHOD_LABELS[m.paymentMethod]}</span>
              <span>{money(m.totalCents)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
