"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, PaymentMethod } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CustomerForm, type CustomerInfo } from "@/components/pos/CustomerForm";
import { ProductPicker } from "@/components/pos/ProductPicker";
import { Cart, type CartLine } from "@/components/pos/Cart";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { completeSale, getSaleReceipt } from "@/lib/actions/sales";

type SaleWithItems = NonNullable<Awaited<ReturnType<typeof getSaleReceipt>>>;
type Step = "customer" | "cart" | "receipt";

export function PosClient({
  products,
  rate,
  categories,
}: {
  products: Product[];
  rate: number | null;
  categories: string[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("customer");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paidInForeignCurrency, setPaidInForeignCurrency] = useState(false);
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

  function continueFromCustomer(info: CustomerInfo) {
    setCustomer(info);
    setStep("cart");
  }

  function checkout() {
    if (!customer) return;
    setError(null);
    startTransition(async () => {
      const result = await completeSale({
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        paymentMethod,
        paidInForeignCurrency,
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerPhone: customer.phone,
        customerAddress: customer.address,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const sale = await getSaleReceipt(result.saleId);
      if (sale) setCompletedSale(sale);
      setStep("receipt");
      router.refresh();
    });
  }

  function newSale() {
    setCustomer(null);
    setLines([]);
    setPaymentMethod("CASH");
    setPaidInForeignCurrency(false);
    setCompletedSale(null);
    setStep("customer");
  }

  if (step === "receipt" && completedSale) {
    return <ReceiptView sale={completedSale} rate={rate} onNewSale={newSale} />;
  }

  if (step === "customer") {
    return <CustomerForm initial={customer ?? undefined} onContinue={continueFromCustomer} />;
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <div className="text-sm">
          <span className="text-muted-foreground">Cliente: </span>
          <span className="font-medium">
            {customer?.firstName} {customer?.lastName}
          </span>
          <span className="text-muted-foreground"> · {customer?.phone}</span>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setStep("customer")}>
          Editar cliente
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] gap-6 flex-1 min-h-0">
        <ProductPicker products={products} rate={rate} categories={categories} onAdd={addProduct} />
        <Cart
          lines={lines.map((l) => ({
            ...l,
            maxStock: productById.get(l.productId)?.stock ?? l.maxStock,
          }))}
          rate={rate}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          paidInForeignCurrency={paidInForeignCurrency}
          onPaidInForeignCurrencyChange={setPaidInForeignCurrency}
          onIncrement={increment}
          onDecrement={decrement}
          onRemove={remove}
          onCheckout={checkout}
          isPending={isPending}
          error={error}
        />
      </div>
    </div>
  );
}
