"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { formatDate } from "@/lib/format";
import { formatLocalCurrency } from "@/lib/currencies";
import { buildQuotePDF, quoteControlNumberLabel, type QuoteForPdf } from "@/lib/quote-pdf";
import { itemDescription, type DeliveryNoteCompany } from "@/lib/delivery-note";
import { pdfFormatForPaperSize } from "@/lib/print-paper-sizes";
import { PrintDialog } from "@/components/print/PrintDialog";
import { PrintableQuote } from "@/components/print/PrintableQuote";
import { ShareDialog } from "@/components/print/ShareDialog";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

export function QuoteReceiptView({
  quote,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
  company,
  onNewQuote,
}: {
  quote: QuoteForPdf;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
  company: DeliveryNoteCompany;
  onNewQuote: () => void;
}) {
  const effectiveRate = rate;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  async function generatePdfBlob(paperSize?: PrintPaperSize) {
    const doc = await buildQuotePDF(
      quote,
      company,
      effectiveRate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      paperSize ? pdfFormatForPaperSize(paperSize) : "letter"
    );
    return doc.output("blob") as Blob;
  }

  async function copyQuote() {
    setNoteError(null);
    setBusy(true);
    try {
      const blob = await generatePdfBlob();
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "application/pdf": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error("Clipboard no soportado");
      }
    } catch {
      setNoteError("Tu navegador no permite copiar el PDF; se descargó en su lugar.");
      await downloadQuote();
    } finally {
      setBusy(false);
    }
  }

  async function downloadQuote() {
    setBusy(true);
    try {
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `presupuesto-${quoteControlNumberLabel(quote)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto py-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Presupuesto generado</h2>
        <p className="text-sm text-muted-foreground">{formatDate(quote.createdAt)}</p>
        <p className="text-xs text-muted-foreground">
          Presupuesto Nº {quoteControlNumberLabel(quote)}
        </p>
        {quote.sellerName && (
          <p className="text-xs text-muted-foreground">Vendedor: {quote.sellerName}</p>
        )}
      </div>

      {quote.customerFirstName && (
        <>
          <Separator />
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium">
                {quote.customerFirstName} {quote.customerLastName}
              </span>
            </div>
            {quote.customerPhone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Teléfono</span>
                <span>{quote.customerPhone}</span>
              </div>
            )}
            {quote.customerAddress && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Dirección</span>
                <span className="text-right">{quote.customerAddress}</span>
              </div>
            )}
          </div>
        </>
      )}

      {quote.note && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Nota</span>
          <p>{quote.note}</p>
        </div>
      )}

      <Separator />

      <div className="flex flex-col gap-1.5">
        {quote.items.map((item, i) => (
          <div key={i} className="flex justify-between items-center text-sm">
            <span>
              {item.quantity} × {itemDescription(item)}
            </span>
            <Price
              eurCents={item.subtotalCents}
              rate={effectiveRate}
              currencyCode={currencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
            />
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex justify-between items-center">
        <span className="font-semibold text-lg">Total</span>
        <Price
          eurCents={quote.totalCents}
          rate={effectiveRate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          size="lg"
          className="items-end"
        />
      </div>
      {exchangeRateEnabled && effectiveRate != null && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Tasa del día</span>
          <span>
            {formatLocalCurrency(effectiveRate, currencyCode)} por 1{referenceCurrency === "USD" ? "$" : "€"}
          </span>
        </div>
      )}

      {noteError && <p className="text-xs text-muted-foreground">{noteError}</p>}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={copyQuote} disabled={busy}>
          {copied ? "¡Copiado!" : "Copiar presupuesto"}
        </Button>
        <Button variant="outline" className="flex-1" onClick={downloadQuote} disabled={busy}>
          Descargar presupuesto
        </Button>
      </div>

      <PrintDialog
        triggerLabel="Imprimir presupuesto"
        title="Imprimir presupuesto"
        defaultPaperSize={printPaperSize}
        buildPdfBlob={(paperSize) => generatePdfBlob(paperSize)}
      >
        {(paperSize) => (
          <PrintableQuote
            quote={quote}
            company={company}
            rate={effectiveRate}
            currencyCode={currencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            paperSize={paperSize}
          />
        )}
      </PrintDialog>

      <ShareDialog
        triggerLabel="Compartir por WhatsApp"
        title="Compartir presupuesto"
        path={`/api/public/quotes/${quote.id}`}
        customerPhone={quote.customerPhone}
        message="Aquí tienes tu presupuesto:"
      />

      <Button size="lg" onClick={onNewQuote}>
        Nuevo presupuesto
      </Button>
    </div>
  );
}
