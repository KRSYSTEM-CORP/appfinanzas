"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, formatDate } from "@/lib/format";
import { getDailyClosingSummary, closeCashRegister, type CashClosingSummary } from "@/lib/actions/cash-closing";
import { buildCashClosingPDF } from "@/lib/cash-closing-pdf";
import { pdfFormatForPaperSize } from "@/lib/print-paper-sizes";
import { PrintDialog } from "@/components/print/PrintDialog";
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
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayStr);
  const [summary, setSummary] = useState(initialSummary);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (date === initialSummary.date) {
      setSummary(initialSummary);
      return;
    }
    startTransition(async () => {
      setSummary(await getDailyClosingSummary(date));
    });
    // initialSummary is intentionally in the deps: a parent re-render with a
    // freshly fetched summary for the same date (e.g. after switching branch
    // in the NavBar) must resync local state, not just a `date` change.
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
      const result = await closeCashRegister(date, note);
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
          value={date}
          max={todayStr}
          onChange={(e) => setDate(e.target.value)}
          className="max-w-[180px]"
        />
        {summary.closed && <Badge variant="secondary">Cerrada</Badge>}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={downloadPdf}>
            Descargar PDF
          </Button>
          <PrintDialog
            triggerLabel="Imprimir"
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

      <div className="grid grid-cols-2 gap-4 max-w-sm">
        <div className="rounded-lg border p-3 flex flex-col gap-1">
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
        <div className="rounded-lg border p-3 flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Ventas</span>
          <span className="text-lg font-semibold">{summary.salesCount}</span>
        </div>
      </div>

      {summary.byMethod.length > 0 && (
        <div className="flex flex-col gap-1.5 max-w-sm">
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

      {summary.closed ? (
        <p className="text-sm text-muted-foreground">
          Cerrada el {formatDate(summary.closed.closedAt)}
          {summary.closed.note && ` — ${summary.closed.note}`}
        </p>
      ) : (
        <div className="flex flex-col gap-2 max-w-sm">
          <Input
            placeholder="Nota (opcional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" onClick={handleClose} disabled={isPending || summary.salesCount === 0}>
            {isPending ? "Cerrando..." : "Cerrar caja de este día"}
          </Button>
          {summary.salesCount === 0 && (
            <p className="text-xs text-muted-foreground">No hay ventas este día para cerrar.</p>
          )}
        </div>
      )}
    </div>
  );
}
