"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, PaymentMethod } from "@prisma/client";
import { ProductPicker } from "@/components/pos/ProductPicker";
import { Cart, type CartLine } from "@/components/pos/Cart";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { completeSale, getSaleReceipt } from "@/lib/actions/sales";

type SaleWithItems = NonNullable<Awaited<ReturnType<typeof getSaleReceipt>>>;

export function PosClient({
  products,
  rate,
}: {
  products: Product[];
  rate: number | null;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<SaleWithItems | null>(null);
  const [isPending, startTransition] = useTransition();

  const productById = new Map(products.map((p) => [p.id, p]));

  function addProduct(product: Product) {
    setError(null);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPriceCents: product.priceCents,
          quantity: 1,
          maxStock: product.stock,
        },
      ];
    });
  }

  function increment(productId: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId && l.quantity < l.maxStock
          ? { ...l, quantity: l.quantity + 1 }
          : l
      )
    );
  }

  function decrement(productId: string) {
    setLines((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0)
    );
  }

  function remove(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function checkout() {
    setError(null);
    startTransition(async () => {
      const result = await completeSale({
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        paymentMethod,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const sale = await getSaleReceipt(result.saleId);
      if (sale) setCompletedSale(sale);
      router.refresh();
    });
  }

  function newSale() {
    setLines([]);
    setPaymentMethod("CASH");
    setCompletedSale(null);
  }

  if (completedSale) {
    return <ReceiptView sale={completedSale} rate={rate} onNewSale={newSale} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 h-full">
      <ProductPicker products={products} rate={rate} onAdd={addProduct} />
      <Cart
        lines={lines.map((l) => ({
          ...l,
          maxStock: productById.get(l.productId)?.stock ?? l.maxStock,
        }))}
        rate={rate}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={setPaymentMethod}
        onIncrement={increment}
        onDecrement={decrement}
        onRemove={remove}
        onCheckout={checkout}
        isPending={isPending}
        error={error}
      />
    </div>
  );
}
