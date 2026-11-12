"use client";

import { useEffect, useState, useTransition } from "react";
import { formatCurrencyCents } from "@/lib/currencies";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, formatDate } from "@/lib/format";
import { Label } from "@/components/ui/label";
import { getDailyClosingSummary, closeCashRegister, type CashClosingSummary } from "@/lib/actions/cash-closing";
import { buildCashClosingPDF } from "@/lib/cash-closing-pdf";
import { pdfFormatForPaperSize } from "@/lib/print-paper-sizes";
import { PrintDialog } from "@/components/print/PrintDialog";
import { CajaChicaCard } from "@/components/reports/CajaChicaCard";
import { PrintableCashClosing } from "@/components/print/PrintableCashClosing";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

export function CashClosingPanel({
  initialSummary,
  todayStr,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  company,
  branchName,
  printPaperSize,
  canClose,
}: {
  initialSummary: CashClosingSummary;
  todayStr: string;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  company: DeliveryNoteCompany;
  branchName: string | null;
  printPaperSize: PrintPaperSize;
  canClose: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayStr);
  const [summary, setSummary] = useState(initialSummary);
  const [note, setNote] = useState("");
  const [countedUsd, setCountedUsd] = useState("");
  const [countedBs, setCountedBs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  // A parent re-render with a freshly fetched summary for the same date (e.g.
  // after switching branch in the NavBar) must resync local state. Adjusted
  // while rendering, so there is no frame with the stale summary.
  const [syncedInitial, setSyncedInitial] = useState(initialSummary);
  if (syncedInitial !== initialSummary) {
    setSyncedInitial(initialSummary);
    if (date === initialSummary.date) setSummary(initialSummary);
  }

  function handleDateChange(next: string) {
    setDate(next);
    if (next === initialSummary.date) setSummary(initialSummary);
  }

  // Any other date is fetched from the server (also re-fetched when the parent
  // summary changes, e.g. after a branch switch).
  useEffect(() => {
    if (date === initialSummary.date) return;
    startTransition(async () => {
      setSummary(await getDailyClosingSummary(date));
    });
  }, [date, initialSummary]);

  async function buildPdf(paperSize?: PrintPaperSize) {
    return buildCashClosingPDF(
      summary,
      company,
      branchName,
      rate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      paperSize ? pdfFormatForPaperSize(paperSize) : "letter"
    );
  }

  async function downloadPdf() {
    setBusy(true);
    try {
      const doc = await buildPdf();
      doc.save(`cierre-de-caja-${summary.date}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    setError(null);
    startTransition(async () => {
      const result = await closeCashRegister(date, note, {
        usdCents: Math.round((Number(countedUsd) || 0) * 100),
        bsCents: Math.round((Number(countedBs) || 0) * 100),
      });
      if (result.success) {
        setNote("");
        setSummary(await getDailyClosingSummary(date));
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          type="date"
          aria-label="Día del cierre de caja"
          value={date}
          max={todayStr}
          onChange={(e) => handleDateChange(e.target.value)}
          className="max-w-[180px]"
        />
        {summary.closed ? (
          <Badge variant="secondary">Cerrada</Badge>
        ) : summary.openingCents != null ? (
          <Badge variant="success">Caja abierta</Badge>
        ) : (
          <Badge variant="outline">Sin abrir</Badge>
        )}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={downloadPdf}>
            Generar Corte Z
          </Button>
          <PrintDialog
            triggerLabel="Imprimir Corte Z"
            title="Imprimir cierre de caja"
            defaultPaperSize={printPaperSize}
            buildPdfBlob={async (paperSize) => (await buildPdf(paperSize)).output("blob") as Blob}
          >
            {(paperSize) => (
              <PrintableCashClosing
                summary={summary}
                company={company}
                branchName={branchName}
                rate={rate}
                currencyCode={currencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
                paperSize={paperSize}
              />
            )}
          </PrintDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-muted/50 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Total vendido</span>
            <Price
              eurCents={summary.totalCents}
              rate={rate}
              currencyCode={currencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              size="lg"
            />
          </div>
          <div className="rounded-2xl bg-muted/50 p-4 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Ventas</span>
            <span className="text-lg font-semibold">{summary.salesCount}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 p-4 sm:col-span-2">
          <span className="text-sm text-muted-foreground">Estado de cobro</span>
          <div className="flex items-center justify-between text-sm">
            <span>Pagadas ({summary.paidCount})</span>
            <Price
              eurCents={summary.paidCents}
              rate={rate}
              currencyCode={currencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span>A crédito ({summary.creditCount})</span>
            <Price
              eurCents={summary.creditCents}
              rate={rate}
              currencyCode={currencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
            />
          </div>
        </div>

        <CajaChicaCard
          summary={summary}
          canEdit={canClose && !summary.closed}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          onChanged={() => startTransition(async () => setSummary(await getDailyClosingSummary(date)))}
        />

        {summary.byMethod.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 p-4">
            <span className="text-sm text-muted-foreground">Por método de pago</span>
            {summary.byMethod.map((m) => (
              <div key={m.paymentMethod} className="flex items-center justify-between text-sm">
                <span>{PAYMENT_METHOD_LABELS[m.paymentMethod]}</span>
                <Price
                  eurCents={m.totalCents}
                  rate={rate}
                  currencyCode={currencyCode}
                  exchangeRateEnabled={exchangeRateEnabled}
                  referenceCurrency={referenceCurrency}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {summary.closed ? (
        <p className="text-sm text-muted-foreground">
          Cerrada el {formatDate(summary.closed.closedAt)}
          {summary.closed.note && ` — ${summary.closed.note}`}
        </p>
      ) : !canClose ? (
        <p className="text-sm text-muted-foreground">Pendiente de cierre — solo el gerente puede cerrar la caja.</p>
      ) : (
        <div className="flex flex-col gap-2 max-w-sm">
          <Label htmlFor="counted-usd">Total contado en $</Label>
          <Input id="counted-usd" type="number" min="0" step="0.01" inputMode="decimal" value={countedUsd} onChange={(e) => setCountedUsd(e.target.value)} />
          <Label htmlFor="counted-bs">Total contado en Bs</Label>
          <Input id="counted-bs" type="number" min="0" step="0.01" inputMode="decimal" value={countedBs} onChange={(e) => setCountedBs(e.target.value)} />
          {(countedUsd !== "" || countedBs !== "") && (() => {
            const ref = (Number(countedUsd) || 0) * 100 + (exchangeRateEnabled && rate ? ((Number(countedBs) || 0) * 100) / rate : 0);
            const diff = Math.round(ref - summary.expectedCashCents);
            return (
              <p className={`text-sm font-bold ${diff === 0 ? "text-success" : diff > 0 ? "text-warning" : "text-destructive"}`}>
                {diff === 0 ? "Caja cuadrada" : diff > 0 ? "Sobrante" : "Faltante"}
                {diff !== 0 && `: ${formatCurrencyCents(referenceCurrency, Math.abs(diff))}`}
              </p>
            );
          })()}
          <Label htmlFor="closing-note">Nota (opcional)</Label>
          <Input
            id="closing-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" onClick={handleClose} disabled={isPending || summary.salesCount === 0}>
            {isPending ? "Cerrando..." : "Cerrar caja"}
          </Button>
          {summary.salesCount === 0 && (
            <p className="text-xs text-muted-foreground">No hay ventas este día para cerrar.</p>
          )}
        </div>
      )}
    </div>
  );
}
