"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatDate } from "@/lib/format";
import { formatCurrencyCents, formatLocalCurrency, getCurrency } from "@/lib/currencies";
import { legacyCurrencyForPayment } from "@/lib/payment-currency";
import {
  buildDeliveryNotePDF,
  controlNumberLabel,
  itemDescription,
  type DeliveryNoteCompany,
} from "@/lib/delivery-note";
import { pdfFormatForPaperSize } from "@/lib/print-paper-sizes";
import { PrintDialog } from "@/components/print/PrintDialog";
import { PrintableSaleDocument } from "@/components/print/PrintableSaleDocument";
import { ShareDialog } from "@/components/print/ShareDialog";
import type {
  PaymentMethod,
  PaymentStatus,
  PrintPaperSize,
  ReferenceCurrency,
  SaleItem,
  SalePayment,
} from "@prisma/client";

type ReceiptSale = {
  id: string;
  controlNumber: number | null;
  receiptControlNumber: number | null;
  createdAt: Date;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paidInForeignCurrency: boolean;
  paymentReference: string | null;
  exchangeRate: number | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  sellerName: string | null;
  note: string | null;
  items: SaleItem[];
  // exchangeRate here is already a plain number (or null) — Decimal
  // instances can't cross the server action boundary, see getSaleReceipt.
  payments: (Omit<SalePayment, "exchangeRate"> & { exchangeRate: number | null })[];
};

export function ReceiptView({
  sale,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
  company,
  onNewSale,
  pendingSync = false,
}: {
  sale: ReceiptSale;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
  company: DeliveryNoteCompany;
  onNewSale: () => void;
  // True for a sale queued offline (see PosClient.tsx) that hasn't reached
  // the server yet — no real control number until it syncs.
  pendingSync?: boolean;
}) {
  // Prefer the rate that was actually in effect when this sale was charged;
  // fall back to the company's current rate only for pre-feature sales that
  // have no snapshot.
  const effectiveRate = sale.exchangeRate != null ? Number(sale.exchangeRate) : rate;
  const localCurrencyName = getCurrency(currencyCode).name.split(" (")[0];
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  async function generatePdfBlob(paperSize?: PrintPaperSize) {
    const doc = await buildDeliveryNotePDF(
      sale,
      company,
      effectiveRate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      paperSize ? pdfFormatForPaperSize(paperSize) : "letter"
    );
    return doc.output("blob") as Blob;
  }

  async function copyNote() {
    setNoteError(null);
    setBusy(true);
    try {
      const blob = await generatePdfBlob();
      // Clipboard PDF writes are only supported in Chromium-based browsers;
      // fall back to a plain download everywhere else.
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ "application/pdf": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        throw new Error("Clipboard no soportado");
      }
    } catch {
      setNoteError("Tu navegador no permite copiar el PDF; se descargó en su lugar.");
      await downloadNote();
    } finally {
      setBusy(false);
    }
  }

  async function downloadNote() {
    setBusy(true);
    try {
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nota-entrega-${controlNumberLabel(sale)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto py-8">
      {pendingSync && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
          Sin conexión — esta venta se guardó en este dispositivo y se sincronizará (con su número
          de control real) apenas vuelva el internet.
        </div>
      )}
      <div className="text-center">
        <h2 className="text-xl font-semibold">Venta completada</h2>
        <p className="text-sm text-muted-foreground">{formatDate(sale.createdAt)}</p>
        <p className="text-xs text-muted-foreground">
          {pendingSync ? "Nota de entrega pendiente de sincronizar" : `Nota de entrega Nº ${controlNumberLabel(sale)}`}
        </p>
        {sale.sellerName && (
          <p className="text-xs text-muted-foreground">Vendedor: {sale.sellerName}</p>
        )}
      </div>

      {sale.customerFirstName && (
        <>
          <Separator />
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cliente</span>
              <span className="font-medium">
                {sale.customerFirstName} {sale.customerLastName}
              </span>
            </div>
            {sale.customerPhone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Teléfono</span>
                <span>{sale.customerPhone}</span>
              </div>
            )}
            {sale.customerAddress && (
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground shrink-0">Dirección</span>
                <span className="text-right">{sale.customerAddress}</span>
              </div>
            )}
          </div>
        </>
      )}

      {sale.note && (
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Nota</span>
          <p>{sale.note}</p>
        </div>
      )}

      <Separator />

      <div className="flex flex-col gap-1.5">
        {sale.items.map((item) => (
          <div key={item.id} className="flex justify-between items-center text-sm">
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
          eurCents={sale.totalCents}
          rate={effectiveRate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          size="lg"
          className="items-end"
        />
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Estado</span>
        <span className={sale.paymentStatus === "CREDIT" ? "font-medium text-destructive" : "font-medium"}>
          {PAYMENT_STATUS_LABELS[sale.paymentStatus]}
        </span>
      </div>
      {sale.paymentStatus === "PAID" && sale.payments.length > 1 ? (
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span>Métodos de pago</span>
          {sale.payments.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>
                {PAYMENT_METHOD_LABELS[p.paymentMethod]}
                {p.reference && ` (${p.reference})`}
              </span>
              <span>
                {formatCurrencyCents(
                  p.currencyCode ?? legacyCurrencyForPayment(p.paymentMethod, referenceCurrency),
                  p.amountCurrencyCents ?? p.amountEurCents
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <>
          {sale.paymentStatus === "PAID" && sale.paymentMethod && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Método de pago</span>
              <span>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span>
            </div>
          )}
          {sale.paymentReference && (
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Referencia</span>
              <span>{sale.paymentReference}</span>
            </div>
          )}
        </>
      )}
      {exchangeRateEnabled && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Moneda</span>
          <span>{sale.paidInForeignCurrency ? "Divisas (USD/EUR)" : localCurrencyName}</span>
        </div>
      )}
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
        <Button variant="outline" className="flex-1" onClick={copyNote} disabled={busy}>
          {copied ? "¡Copiado!" : "Copiar nota de entrega"}
        </Button>
        <Button variant="outline" className="flex-1" onClick={downloadNote} disabled={busy}>
          Descargar nota de entrega
        </Button>
      </div>

      <PrintDialog
        triggerLabel="Imprimir nota de entrega"
        title="Imprimir nota de entrega"
        defaultPaperSize={printPaperSize}
        buildPdfBlob={(paperSize) => generatePdfBlob(paperSize)}
      >
        {(paperSize) => (
          <PrintableSaleDocument
            sale={sale}
            company={company}
            rate={effectiveRate}
            currencyCode={currencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            variant="delivery-note"
            paperSize={paperSize}
          />
        )}
      </PrintDialog>

      {!pendingSync && (
        <ShareDialog
          triggerLabel="Compartir por WhatsApp"
          title="Compartir nota de entrega"
          path={`/api/public/sales/${sale.id}?doc=note`}
          customerPhone={sale.customerPhone}
          message="Aquí tienes tu nota de entrega:"
        />
      )}

      <Button size="lg" onClick={onNewSale}>
        Nueva venta
      </Button>
    </div>
  );
}
