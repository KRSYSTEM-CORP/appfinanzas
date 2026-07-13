"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, formatDate } from "@/lib/format";
import type { PaymentMethod, SaleItem } from "@prisma/client";

export function ReceiptView({
  sale,
  rate,
  onNewSale,
}: {
  sale: {
    id: string;
    createdAt: Date;
    totalCents: number;
    paymentMethod: PaymentMethod;
    paidInForeignCurrency: boolean;
    paymentReference: string | null;
    exchangeRate: number | null;
    customerFirstName: string | null;
    customerLastName: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    items: SaleItem[];
  };
  rate: number | null;
  onNewSale: () => void;
}) {
  // Prefer the rate that was actually in effect when this sale was charged;
  // fall back to the company's current rate only for pre-feature sales that
  // have no snapshot.
  const effectiveRate = sale.exchangeRate != null ? Number(sale.exchangeRate) : rate;

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto py-8">
      <div className="text-center">
        <h2 className="text-xl font-semibold">Venta completada</h2>
        <p className="text-sm text-muted-foreground">{formatDate(sale.createdAt)}</p>
        <p className="text-xs text-muted-foreground">Ticket #{sale.id.slice(-8)}</p>
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
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Método de pago</span>
        <span>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span>
      </div>
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

      <Button size="lg" onClick={onNewSale}>
        Nueva venta
      </Button>
    </div>
  );
}
