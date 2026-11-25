import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";
import { PAYMENT_METHOD_LABELS, formatDate, formatDateOnly } from "@/lib/format";
import { DEFAULT_CURRENCY_CODE, eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { CashClosingSummary } from "@/lib/actions/cash-closing";
import { grandTotals, groupIncomeByMethod } from "@/lib/income-by-method";
import { OUTFLOW_METHOD_LABEL } from "@/lib/cash-outflow";
import { countedDifference, differenceLabel, expectedCashByCurrency } from "@/lib/cash-closing";
import { SHOP_TIME_ZONE } from "@/lib/report-types";
import { isThermal, printRootClass } from "@/lib/print-paper-sizes";

const formatTime = (d: Date | string) =>
  new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: SHOP_TIME_ZONE }).format(typeof d === "string" ? new Date(d) : d);

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

  const refMoney = (cents: number) => formatCurrencyCents(referenceCurrency, cents);
  const localMoney = (cents: number) => formatCurrencyCents(currencyCode, cents);
  const refName = referenceCurrency === "EUR" ? "euros" : "dólares";
  const expected = expectedCashByCurrency({
    openingCents: summary.openingCents,
    openingRefCents: summary.openingRefCents,
    openingLocalCents: summary.openingLocalCents,
    incomeRows: summary.byAccount ?? [],
    outflows: summary.outflows,
    refundedCash: summary.refundedCash,
    rate,
    referenceCurrency,
    localCurrency: currencyCode,
  });
  const showBs = showLocal || expected.localCents !== 0 || (summary.counted?.bsCents ?? 0) > 0;
  const diff = summary.counted ? countedDifference(expected, summary.counted) : { refDiffCents: 0, localDiffCents: 0 };
  const diffText = (cents: number, fmt: (c: number) => string) =>
    `${cents > 0 ? "+" : cents < 0 ? "−" : ""}${fmt(Math.abs(cents))} · ${differenceLabel(cents)}`;
  const incomeSections = groupIncomeByMethod(summary.byAccount);
  const incomeTotal = grandTotals(incomeSections);

  return (
    <div className={printRootClass(paperSize)}>
      <div className="mb-2 text-center">
        {company.logoDataUrl && !thermal && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logoDataUrl} alt="" className="mx-auto mb-1 h-10 object-contain" />
        )}
        <p className="print-title">{company.name}</p>
        {company.fiscalLegalName && <p className="text-xs">{company.fiscalLegalName}</p>}
        {company.fiscalRif && <p className="text-xs">RIF: {company.fiscalRif}</p>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <p className="print-title">CORTE Z · CIERRE DE CAJA</p>
      <p className="text-center text-xs">Fecha: {formatDateOnly(summary.date)}</p>
      {branchName && <p className="text-center text-xs">Sucursal: {branchName}</p>}
      {summary.shiftNumber != null && (
        <p className="text-center text-xs">
          Turno {summary.shiftNumber}
          {summary.responsibleName ? ` · Responsable: ${summary.responsibleName}` : ""}
        </p>
      )}
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
      <p className="print-title">Ventas del turno</p>
      <div className="flex justify-between">
        <span>Ventas pagadas ({summary.paidCount}):</span>
        <span>{money(summary.paidCents)}</span>
      </div>
      <div className="flex justify-between">
        <span>A crédito, por cobrar ({summary.creditCount}):</span>
        <span>{money(summary.creditCents)}</span>
      </div>
      <div className="flex justify-between font-bold">
        <span>Total vendido ({summary.salesCount}):</span>
        <span>{money(summary.totalCents)}</span>
      </div>
      {summary.voidedCount > 0 && (
        <div className="flex justify-between text-xs">
          <span>Anuladas ({summary.voidedCount}), no suman:</span>
          <span>{money(summary.voidedCents)}</span>
        </div>
      )}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="print-title">Caja Chica (efectivo)</p>
      <div className="flex justify-between">
        <span>Apertura:</span>
        <span>{money(summary.openingCents ?? 0)}</span>
      </div>
      <div className="flex justify-between">
        <span>Ventas en efectivo:</span>
        <span>{money(summary.cashSalesCents)}</span>
      </div>
      <div className="flex justify-between">
        <span>Salidas en efectivo:</span>
        <span>−{money(summary.cashOutflowsCents)}</span>
      </div>
      {summary.outflowsCents > summary.cashOutflowsCents && (
        <div className="flex justify-between text-xs">
          <span>Salidas desde cuentas (no tocan la caja):</span>
          <span>{money(summary.outflowsCents - summary.cashOutflowsCents)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold">
        <span>Esperado en {refName}:</span>
        <span>{refMoney(expected.refCents)}</span>
      </div>
      {showBs && (
        <div className="flex justify-between font-bold">
          <span>Esperado en bolívares:</span>
          <span>{localMoney(expected.localCents)}</span>
        </div>
      )}
      {summary.counted ? (
        <>
          <div className="flex justify-between">
            <span>Contado en {refName}:</span>
            <span>{refMoney(summary.counted.usdCents)}</span>
          </div>
          {showBs && (
            <div className="flex justify-between">
              <span>Contado en bolívares:</span>
              <span>{localMoney(summary.counted.bsCents)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>Diferencia en {refName}:</span>
            <span>{diffText(diff.refDiffCents, refMoney)}</span>
          </div>
          {showBs && (
            <div className="flex justify-between font-bold">
              <span>Diferencia en bolívares:</span>
              <span>{diffText(diff.localDiffCents, localMoney)}</span>
            </div>
          )}
        </>
      ) : summary.closed ? (
        <p className="text-xs">Efectivo contado: no se registró conteo</p>
      ) : null}

      <div className="my-2 border-t border-dashed border-black" />
      <p className="print-title">Salidas y devoluciones</p>
      {summary.outflows.length === 0 ? (
        <p className="text-xs">Sin salidas de Caja Chica en este turno.</p>
      ) : (
        summary.outflows.map((o) => (
          <div key={o.id} className="flex justify-between text-xs">
            <span>
              {formatTime(o.createdAt)} {o.concept} ({[o.paymentMethod ? OUTFLOW_METHOD_LABEL[o.paymentMethod] : "Efectivo", o.accountLabel].filter(Boolean).join(" · ")})
            </span>
            <span>
              −
              {o.currencyCode && o.amountCurrencyCents != null && o.currencyCode !== referenceCurrency
                ? formatCurrencyCents(o.currencyCode, o.amountCurrencyCents)
                : money(o.amountCents)}
            </span>
          </div>
        ))
      )}

      {summary.byCurrency.length > 0 && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <p className="font-bold">Cobrado por moneda</p>
          {summary.byCurrency.map((c) => (
            <div key={c.currencyCode} className="flex justify-between">
              <span>{c.currencyCode}</span>
              <span>{formatCurrencyCents(c.currencyCode, c.cents)}</span>
            </div>
          ))}
        </>
      )}

      {incomeSections.length > 0 && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <p className="print-title">Ingresos por método y cuenta</p>
          {incomeSections.map((s) => (
            <div key={s.key} className="mb-1">
              <div className="flex justify-between font-bold">
                <span>{s.title} ({s.count})</span>
                <span>{s.byCurrency.map((c) => formatCurrencyCents(c.currencyCode, c.cents)).join(" + ")}</span>
              </div>
              {s.rows.map((r, i) => (
                <div key={`${r.accountId ?? r.paymentMethod}-${r.currencyCode}-${i}`} className="flex justify-between text-xs">
                  <span>
                    {[r.label, r.kind === "PAGO_MOVIL" || r.kind === "PUNTO_DE_VENTA" || r.accountNumber ? r.accountNumber : null].filter(Boolean).join(" · ")} ({r.count})
                  </span>
                  <span>{formatCurrencyCents(r.currencyCode, r.cents)}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="flex justify-between font-bold">
            <span>Total cobrado ({incomeTotal.count}):</span>
            <span>{money(incomeTotal.refCents)}</span>
          </div>
        </>
      )}

      {summary.byMethod.length > 0 && (
        <>
          <div className="my-2 border-t border-dashed border-black" />
          <p className="print-title">Por método de pago (ref.)</p>
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
