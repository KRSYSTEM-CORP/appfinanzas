"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CustomerForm, type CustomerInfo } from "@/components/pos/CustomerForm";
import { ProductPicker } from "@/components/pos/ProductPicker";
import { QuoteCart, type QuoteCartLine } from "@/components/quotes/QuoteCart";
import { QuoteReceiptView } from "@/components/quotes/QuoteReceiptView";
import { createQuote, getQuote } from "@/lib/actions/quotes";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

type QuoteWithItems = NonNullable<Awaited<ReturnType<typeof getQuote>>>;
type Step = "customer" | "cart" | "receipt";

export function QuoteClient({
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
  categories,
  company,
}: {
  products: Product[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
  categories: string[];
  company: DeliveryNoteCompany;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("customer");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [lines, setLines] = useState<QuoteCartLine[]>([]);
  const [note, setNote] = useState("");
  const [useLocalCurrency, setUseLocalCurrency] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completedQuote, setCompletedQuote] = useState<QuoteWithItems | null>(null);
  const [isPending, startTransition] = useTransition();

  const productById = new Map(products.map((p) => [p.id, p]));

  function addProduct(product: Product) {
    setError(null);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
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
          maxStock: Math.max(product.stock, 1),
        },
      ];
    });
  }

  function increment(productId: string) {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l))
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

  function generate() {
    if (!customer) return;
    setError(null);
    startTransition(async () => {
      const result = await createQuote({
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        customerFirstName: customer.firstName,
        customerLastName: customer.lastName,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        note: note.trim() || undefined,
        useLocalCurrency,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      const quote = await getQuote(result.quoteId);
      if (quote) setCompletedQuote(quote);
      setStep("receipt");
      router.refresh();
    });
  }

  function newQuote() {
    setCustomer(null);
    setLines([]);
    setNote("");
    setCompletedQuote(null);
    setStep("customer");
  }

  if (step === "receipt" && completedQuote) {
    return (
      <QuoteReceiptView
        quote={completedQuote}
        rate={rate}
        currencyCode={currencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        printPaperSize={printPaperSize}
        company={company}
        onNewQuote={newQuote}
      />
    );
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
        <ProductPicker
          products={products}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          categories={categories}
          onAdd={addProduct}
        />
        <QuoteCart
          lines={lines.map((l) => ({
            ...l,
            maxStock: Math.max(productById.get(l.productId)?.stock ?? l.maxStock, l.quantity),
          }))}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          useLocalCurrency={useLocalCurrency}
          onToggleCurrency={setUseLocalCurrency}
          onIncrement={increment}
          onDecrement={decrement}
          onRemove={remove}
          note={note}
          onNoteChange={setNote}
          onGenerate={generate}
          isPending={isPending}
          error={error}
        />
      </div>
    </div>
  );
}
