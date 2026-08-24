"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getQuote } from "@/lib/actions/quotes";
import { buildQuotePDF, quoteControlNumberLabel } from "@/lib/quote-pdf";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { ReferenceCurrency } from "@prisma/client";

// Lazily fetches the quote's own items (listQuotes doesn't bulk-load them —
// most rows in a list this size are never downloaded) only when actually
// clicked, then builds and downloads the same PDF QuoteReceiptView offers
// right after generating a quote.
export function QuoteDocumentButton({
  quoteId,
  company,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
}: {
  quoteId: string;
  company: DeliveryNoteCompany;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setBusy(true);
    try {
      const quote = await getQuote(quoteId);
      if (!quote) {
        setError("Presupuesto no encontrado");
        return;
      }
      const doc = await buildQuotePDF(
        quote,
        company,
        quote.exchangeRate ?? rate,
        currencyCode,
        exchangeRateEnabled,
        referenceCurrency,
        "letter",
        quote.useLocalCurrency
      );
      const blob = doc.output("blob") as Blob;
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
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={download}>
        {busy ? "Generando..." : "Descargar"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
