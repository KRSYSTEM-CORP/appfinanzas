"use client";

import { useState } from "react";
import { CheckIcon, PlusIcon, PrinterIcon, StampIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/pos/Confetti";
import { PosDocumentSheet } from "@/components/pos/PosDocumentSheet";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { controlNumberLabel, type DeliveryNoteCompany } from "@/lib/delivery-note";
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
  invoiceNumber: number | null;
  createdAt: Date;
  totalCents: number;
  discountCents: number;
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

// Paso 3 de la preview («Venta registrada»): check verde, monto, vuelto,
// «Imprimir o compartir» y «Nueva venta», con confeti de celebración. La
// factura no se genera aquí: queda bloqueada hasta que se active el módulo de
// factura fiscal en el cobro.
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
  documentKind = "delivery",
  change = null,
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
  // Documento elegido en el cobro: Nota de entrega o Ticket de caja.
  documentKind?: "delivery" | "ticket";
  // Vuelto entregado en efectivo, ya formateado.
  change?: string | null;
}) {
  // Prefer the rate that was actually in effect when this sale was charged;
  // fall back to the company's current rate only for pre-feature sales that
  // have no snapshot.
  const effectiveRate = sale.exchangeRate != null ? Number(sale.exchangeRate) : rate;
  const [sheetOpen, setSheetOpen] = useState(false);
  const credit = sale.paymentStatus === "CREDIT";
  const exonerated = sale.totalCents === 0 && sale.discountCents > 0;
  const docName = documentKind === "ticket" ? "Ticket de caja" : "Nota de entrega";
  const number = pendingSync ? "pendiente" : controlNumberLabel(sale);
  const customer = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.trim() || "Mostrador";
  const total = formatCurrencyCents(referenceCurrency, sale.totalCents);
  const local =
    exchangeRateEnabled && effectiveRate != null
      ? formatLocalCurrency(eurCentsToLocal(sale.totalCents, effectiveRate), currencyCode)
      : null;
  const message = `Hola ${customer.split(" ")[0]}, te comparto tu ${docName.toLowerCase()} N.º ${number} por ${total}${local ? ` (${local})` : ""}. Gracias por tu compra en ${company.name}.`;
  const Icon = credit ? StampIcon : CheckIcon;

  return (
    <div className="flex flex-col gap-3">
      <Confetti burstKey={sale.id} />
      {pendingSync && (
        <div className="mx-auto w-full max-w-[520px] rounded-[14px] bg-warning/18 px-3 py-2 text-sm font-semibold text-warning">
          Sin conexión — esta venta se guardó en este dispositivo y se sincronizará (con su número de control real) apenas vuelva el internet.
        </div>
      )}
      <div className="mx-auto my-5 w-full max-w-[520px] rounded-[19px] bg-card px-5 py-[30px] text-center shadow-(--shadow-card)">
        <span className="mx-auto grid size-[76px] place-items-center rounded-full bg-success/14 text-success">
          <Icon className="size-10" strokeWidth={3} aria-hidden />
        </span>
        <h2 className="mt-3 mb-0.5 text-[21px] font-bold">
          {exonerated ? "Venta exonerada registrada" : credit ? "Venta a crédito registrada" : "¡Venta cobrada!"}
        </h2>
        <p className="mb-1 text-muted-foreground">
          {docName} N.º {number} · {customer}
        </p>
        <div className="text-[44px] leading-[1.05] font-extrabold tracking-[-0.04em] tabular-nums">{total}</div>
        {local && <div className="text-muted-foreground">{local}</div>}
        {change && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-success/14 px-2.5 py-[3px] text-xs font-semibold text-success">
            Vuelto entregado {change}
          </div>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => setSheetOpen(true)}>
            <PrinterIcon className="size-4" strokeWidth={2.2} /> Imprimir o compartir
          </Button>
          <Button type="button" variant="outline" onClick={onNewSale}>
            <PlusIcon className="size-4" strokeWidth={2.2} /> Nueva venta
          </Button>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">Ticket 58/80 mm, carta, PDF y WhatsApp.</p>
      </div>
      <PosDocumentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        sale={sale}
        company={company}
        rate={effectiveRate}
        currencyCode={currencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        kind={documentKind}
        defaultFormat={documentKind === "ticket" ? (printPaperSize === "THERMAL_58" ? "58" : "80") : "c"}
        message={message}
        pendingSync={pendingSync}
      />
    </div>
  );
}
