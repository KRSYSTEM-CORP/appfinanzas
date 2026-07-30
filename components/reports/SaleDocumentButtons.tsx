"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildDeliveryNotePDF,
  buildPaymentReceiptPDF,
  controlNumberLabel,
  receiptControlNumberLabel,
  type DeliveryNoteCompany,
  type DeliveryNoteSale,
} from "@/lib/delivery-note";
import { pdfFormatForPaperSize } from "@/lib/print-paper-sizes";
import { PrintDialog } from "@/components/print/PrintDialog";
import { PrintableSaleDocument } from "@/components/print/PrintableSaleDocument";
import { ShareDialog } from "@/components/print/ShareDialog";
import { getOrCreateInvoiceNumber } from "@/lib/actions/sales";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

export function SaleDocumentButtons({
  sale,
  company,
  currentRate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
}: {
  sale: DeliveryNoteSale & { exchangeRate: number | null; paidExchangeRate: number | null };
  company: DeliveryNoteCompany;
  currentRate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
}) {
  const [busy, setBusy] = useState(false);
  // Lazily assigned (see getOrCreateInvoiceNumber) the first time a Factura
  // is actually requested for this sale — kept in state so the UI reflects
  // the real number right away instead of waiting for a full page reload.
  const [invoiceNumber, setInvoiceNumber] = useState(sale.invoiceNumber ?? null);
  // Once a credit sale's payment is registered, its amounts should stay
  // reconciled with what was actually collected (paidExchangeRate) rather
  // than the original, possibly stale, sale-time snapshot.
  const noteRate = sale.paidExchangeRate ?? sale.exchangeRate ?? currentRate;
  const receiptRate = sale.paidExchangeRate ?? sale.exchangeRate ?? currentRate;

  async function ensureInvoiceNumber(): Promise<number> {
    if (invoiceNumber != null) return invoiceNumber;
    const result = await getOrCreateInvoiceNumber(sale.id);
    if (!result) throw new Error("No se pudo generar la factura");
    setInvoiceNumber(result.invoiceNumber);
    return result.invoiceNumber;
  }

  async function buildNotePdf(paperSize?: PrintPaperSize) {
    return buildDeliveryNotePDF(
      sale,
      company,
      noteRate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      paperSize ? pdfFormatForPaperSize(paperSize) : "letter"
    );
  }

  async function buildInvoicePdf(paperSize?: PrintPaperSize) {
    const number = await ensureInvoiceNumber();
    const doc = await buildDeliveryNotePDF(
      { ...sale, invoiceNumber: number },
      company,
      noteRate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      paperSize ? pdfFormatForPaperSize(paperSize) : "letter",
      "invoice"
    );
    return { doc, number };
  }

  async function buildReceiptPdf(paperSize?: PrintPaperSize) {
    return buildPaymentReceiptPDF(
      sale,
      company,
      receiptRate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      paperSize ? pdfFormatForPaperSize(paperSize) : "letter"
    );
  }

  async function downloadNote() {
    setBusy(true);
    try {
      const doc = await buildNotePdf();
      doc.save(`nota-entrega-${controlNumberLabel(sale)}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  async function downloadInvoice() {
    setBusy(true);
    try {
      const { doc, number } = await buildInvoicePdf();
      doc.save(`factura-${String(number).padStart(6, "0")}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  async function downloadReceipt() {
    setBusy(true);
    try {
      const doc = await buildReceiptPdf();
      doc.save(`recibo-pago-${receiptControlNumberLabel(sale)}.pdf`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="outline" disabled={busy} onClick={downloadNote}>
        Nota de entrega
      </Button>
      <PrintDialog
        triggerLabel="Imprimir nota"
        title="Imprimir nota de entrega"
        defaultPaperSize={printPaperSize}
        buildPdfBlob={async (paperSize) => (await buildNotePdf(paperSize)).output("blob") as Blob}
      >
        {(paperSize) => (
          <PrintableSaleDocument
            sale={sale}
            company={company}
            rate={noteRate}
            currencyCode={currencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            variant="delivery-note"
            paperSize={paperSize}
          />
        )}
      </PrintDialog>
      <ShareDialog
        triggerLabel="Compartir nota"
        title="Compartir nota de entrega"
        path={`/api/public/sales/${sale.id}?doc=note`}
        customerPhone={sale.customerPhone}
        message="Aquí tienes tu nota de entrega:"
      />
      <Button size="sm" variant="outline" disabled={busy} onClick={downloadInvoice}>
        Factura
      </Button>
      <PrintDialog
        triggerLabel="Imprimir factura"
        title="Imprimir factura"
        defaultPaperSize={printPaperSize}
        buildPdfBlob={async (paperSize) => (await buildInvoicePdf(paperSize)).doc.output("blob") as Blob}
      >
        {(paperSize) => (
          <PrintableSaleDocument
            sale={{ ...sale, invoiceNumber }}
            company={company}
            rate={noteRate}
            currencyCode={currencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            variant="invoice"
            paperSize={paperSize}
          />
        )}
      </PrintDialog>
      {invoiceNumber != null && (
        <ShareDialog
          triggerLabel="Compartir factura"
          title="Compartir factura"
          path={`/api/public/sales/${sale.id}?doc=invoice`}
          customerPhone={sale.customerPhone}
          message="Aquí tienes tu factura:"
        />
      )}
      {sale.receiptControlNumber != null && (
        <>
          <Button size="sm" variant="outline" disabled={busy} onClick={downloadReceipt}>
            Recibo de pago
          </Button>
          <PrintDialog
            triggerLabel="Imprimir recibo"
            title="Imprimir recibo de pago"
            defaultPaperSize={printPaperSize}
            buildPdfBlob={async (paperSize) => (await buildReceiptPdf(paperSize)).output("blob") as Blob}
          >
            {(paperSize) => (
              <PrintableSaleDocument
                sale={sale}
                company={company}
                rate={receiptRate}
                currencyCode={currencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
                variant="receipt"
                paperSize={paperSize}
              />
            )}
          </PrintDialog>
          <ShareDialog
            triggerLabel="Compartir recibo"
            title="Compartir recibo de pago"
            path={`/api/public/sales/${sale.id}?doc=receipt`}
            customerPhone={sale.customerPhone}
            message="Aquí tienes tu recibo de pago:"
          />
        </>
      )}
    </div>
  );
}
