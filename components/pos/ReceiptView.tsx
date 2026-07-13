"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PaymentMethod, SaleItem } from "@prisma/client";

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  OTHER: "Otro",
};

export function ReceiptView({
  sale,
  onNewSale,
}: {
  sale: {
    id: string;
    createdAt: Date;
    totalCents: number;
    paymentMethod: PaymentMethod;
    items: SaleItem[];
  };
  onNewSale: () => void;
}) {
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
          <div key={item.id} className="flex justify-between text-sm">
            <span>
              {item.quantity} × {item.productName}
            </span>
            <span>{formatCurrency(item.subtotalCents)}</span>
          </div>
        ))}
      </div>

      <Separator />

      <div className="flex justify-between font-semibold text-lg">
        <span>Total</span>
        <span>{formatCurrency(sale.totalCents)}</span>
      </div>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>Método de pago</span>
        <span>{paymentLabels[sale.paymentMethod]}</span>
      </div>

      <Button size="lg" onClick={onNewSale}>
        Nueva venta
      </Button>
    </div>
  );
}
