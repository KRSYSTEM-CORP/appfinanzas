"use client";

import { useState } from "react";
import { FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  // Once a credit sale's payment is registered, its amounts should stay
  // reconciled with what was actually collected (paidExchangeRate) rather
  // than the original, possibly stale, sale-time snapshot.
  const noteRate = sale.paidExchangeRate ?? sale.exchangeRate ?? currentRate;
  const receiptRate = sale.paidExchangeRate ?? sale.exchangeRate ?? currentRate;
  const hasInvoice = sale.invoiceNumber != null;
  const hasReceipt = sale.receiptControlNumber != null;

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

  // Only ever called when hasInvoice is true — a Factura that was never
  // generated at checkout can't be created retroactively from here (or
  // anywhere else): Nota de entrega vs. Factura is a decision fixed at the
  // moment of sale, not something this viewer offers to change after the
  // fact.
  async function buildInvoicePdf(paperSize?: PrintPaperSize) {
    return buildDeliveryNotePDF(
      sale,
      company,
      noteRate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      paperSize ? pdfFormatForPaperSize(paperSize) : "letter",
      "invoice"
    );
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
      const doc = await buildInvoicePdf();
      doc.save(`factura-${String(sale.invoiceNumber).padStart(6, "0")}.pdf`);
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
    <Popover>
      <PopoverTrigger
        render={
          <Button size="sm" variant="outline">
            <FileTextIcon className="size-4" />
            Documentos
          </Button>
        }
      />
      <PopoverContent>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Nota de entrega</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={downloadNote}>
                Descargar
              </Button>
              <PrintDialog
                triggerLabel="Imprimir"
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
                triggerLabel="Compartir"
                title="Compartir nota de entrega"
                path={`/api/public/sales/${sale.id}?doc=note`}
                customerPhone={sale.customerPhone}
                message="Aquí tienes tu nota de entrega:"
              />
            </div>
          </div>

          {hasInvoice && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Factura</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={downloadInvoice}>
                  Descargar
                </Button>
                <PrintDialog
                  triggerLabel="Imprimir"
                  title="Imprimir factura"
                  defaultPaperSize={printPaperSize}
                  buildPdfBlob={async (paperSize) => (await buildInvoicePdf(paperSize)).output("blob") as Blob}
                >
                  {(paperSize) => (
                    <PrintableSaleDocument
                      sale={sale}
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
                <ShareDialog
                  triggerLabel="Compartir"
                  title="Compartir factura"
                  path={`/api/public/sales/${sale.id}?doc=invoice`}
                  customerPhone={sale.customerPhone}
                  message="Aquí tienes tu factura:"
                />
              </div>
            </div>
          )}

          {hasReceipt && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Recibo de pago</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={busy} onClick={downloadReceipt}>
                  Descargar
                </Button>
                <PrintDialog
                  triggerLabel="Imprimir"
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
                  triggerLabel="Compartir"
                  title="Compartir recibo de pago"
                  path={`/api/public/sales/${sale.id}?doc=receipt`}
                  customerPhone={sale.customerPhone}
                  message="Aquí tienes tu recibo de pago:"
                />
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
