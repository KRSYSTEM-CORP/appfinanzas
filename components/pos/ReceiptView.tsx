"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/money/Price";
import { formatDate } from "@/lib/format";
import type { PaymentMethod, SaleItem } from "@prisma/client";

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

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
    exchangeRate: number | null;
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
        <span>{paymentLabels[sale.paymentMethod]}</span>
      </div>
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
