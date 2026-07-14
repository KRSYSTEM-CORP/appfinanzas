"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatDate, formatVES } from "@/lib/format";
import { buildDeliveryNotePDF, controlNumberLabel } from "@/lib/delivery-note";
import type { PaymentMethod, PaymentStatus, SaleItem } from "@prisma/client";

type ReceiptSale = {
  id: string;
  controlNumber: number | null;
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
  items: SaleItem[];
};

export function ReceiptView({
  sale,
  rate,
  companyName,
  companyLogoDataUrl,
  onNewSale,
}: {
  sale: ReceiptSale;
  rate: number | null;
  companyName: string;
  companyLogoDataUrl: string | null;
  onNewSale: () => void;
}) {
  // Prefer the rate that was actually in effect when this sale was charged;
  // fall back to the company's current rate only for pre-feature sales that
  // have no snapshot.
  const effectiveRate = sale.exchangeRate != null ? Number(sale.exchangeRate) : rate;
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  async function generatePdfBlob() {
    const doc = await buildDeliveryNotePDF(
      sale,
      { name: companyName, logoDataUrl: companyLogoDataUrl },
      effectiveRate
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
      <div className="text-center">
        <h2 className="text-xl font-semibold">Venta completada</h2>
        <p className="text-sm text-muted-foreground">{formatDate(sale.createdAt)}</p>
        <p className="text-xs text-muted-foreground">
          Nota de entrega Nº {controlNumberLabel(sale)}
        </p>
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

      <Separator />

      <div className="flex flex-col gap-1.5">
        {sale.items.map((item) => (
          <div key={item.id} className="flex justify-between items-center text-sm">
            <span>
              {item.quantity} × {item.productName}
            </span>
            <Price eurCents={item.subtotalCents} rate={effectiveRate} />
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex justify-between items-center">
        <span className="font-semibold text-lg">Total</span>
        <Price eurCents={sale.totalCents} rate={effectiveRate} size="lg" className="items-end" />
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Estado</span>
        <span className={sale.paymentStatus === "CREDIT" ? "font-medium text-destructive" : "font-medium"}>
          {PAYMENT_STATUS_LABELS[sale.paymentStatus]}
        </span>
      </div>
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
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Moneda</span>
        <span>{sale.paidInForeignCurrency ? "Divisas (USD/EUR)" : "Bolívares"}</span>
      </div>
      {effectiveRate != null && (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Tasa del día</span>
          <span>{formatVES(effectiveRate)} por 1€</span>
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

      <Button size="lg" onClick={onNewSale}>
        Nueva venta
      </Button>
    </div>
  );
}
