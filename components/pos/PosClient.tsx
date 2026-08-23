"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, PaymentStatus, SaleItem, SalePayment } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CustomerForm, type CustomerInfo } from "@/components/pos/CustomerForm";
import { ProductPicker } from "@/components/pos/ProductPicker";
import { Cart, type CartLine } from "@/components/pos/Cart";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { defaultPaymentSplitRows, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { completeSale, getSaleReceipt } from "@/lib/actions/sales";
import { resolveSalePayments } from "@/lib/payment-currency";
import { computeItemDiscountCents } from "@/lib/discount";
import { resolveTierPrice, tierPriceCents, type PriceTier, type TieredProduct } from "@/lib/pricing";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { queueSale, type PendingSaleInput } from "@/lib/offline/sync";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";

type SaleWithItems = NonNullable<Awaited<ReturnType<typeof getSaleReceipt>>>;
type Step = "customer" | "cart" | "receipt";

export function PosClient({
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
  categories,
  company,
  sellerName,
}: {
  products: Product[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
  categories: string[];
  company: DeliveryNoteCompany;
  sellerName: string;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [step, setStep] = useState<Step>("customer");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PAID");
  const [paymentRows, setPaymentRows] = useState<PaymentSplitRow[]>(() =>
    defaultPaymentSplitRows(0, rate, exchangeRateEnabled)
  );
  const [note, setNote] = useState("");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [error, setError] = useState<string | null>(null);
  // Either a real, server-confirmed sale, or a locally-built stand-in for one
  // queued while offline (see queueOfflineSale below) — both render fine in
  // ReceiptView since they share the same shape.
  const [completedSale, setCompletedSale] = useState<SaleWithItems | null>(null);
  const [pendingSync, setPendingSync] = useState(false);
  const [isPending, startTransition] = useTransition();

  const productById = new Map(products.map((p) => [p.id, p]));
  const rawTotal = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const discountValue = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  // Same per-line rounding completeSale applies server-side, so the payment
  // split this drives always matches the total that's actually validated at
  // checkout (see assertPaymentsMatchTotal in lib/payment-currency.ts).
  const discountCentsTotal = lines.reduce(
    (sum, l) => sum + computeItemDiscountCents(l.unitPriceCents * l.quantity, discountValue),
    0
  );
  const total = rawTotal - discountCentsTotal;

  // Keep the single default payment row in sync with the cart total as
  // products are added/removed, so the common single-method case never
  // requires the user to manually retype the amount. Once a second row is
  // added (an intentional split), amounts are fully user-controlled.
  useEffect(() => {
    setPaymentRows((prev) => (prev.length === 1 ? defaultPaymentSplitRows(total, rate, exchangeRateEnabled) : prev));
  }, [total, rate, exchangeRateEnabled]);

  // Unlimited for a product that doesn't track stock — there's no count to
  // cap against.
  function maxStockFor(product: Product): number {
    return product.trackStock ? product.stock : Infinity;
  }

  // The price a line should show for its current quantity: the seller's
  // manual tier pick if they made one (and the product actually has that
  // tier configured), otherwise whatever quantity-based tier applies.
  function linePriceCents(product: TieredProduct, quantity: number, override: PriceTier | null): number {
    if (override) {
      const overridePrice = tierPriceCents(product, override);
      if (overridePrice != null) return overridePrice;
    }
    return resolveTierPrice(product, quantity).priceCents;
  }

  function addProduct(product: Product) {
    setError(null);
    setLines((prev) => {
      const maxStock = maxStockFor(product);
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        if (existing.quantity >= maxStock) return prev;
        const quantity = existing.quantity + 1;
        return prev.map((l) =>
          l.productId === product.id
            ? { ...l, quantity, unitPriceCents: linePriceCents(l.product, quantity, l.priceTierOverride) }
            : l
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unitPriceCents: linePriceCents(product, 1, null),
          quantity: 1,
          maxStock,
          product,
          priceTierOverride: null,
        },
      ];
    });
  }

  function increment(productId: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId || l.quantity >= l.maxStock) return l;
        const quantity = l.quantity + 1;
        return { ...l, quantity, unitPriceCents: linePriceCents(l.product, quantity, l.priceTierOverride) };
      })
    );
  }

  function decrement(productId: string) {
    setLines((prev) =>
      prev
        .map((l) => {
          if (l.productId !== productId) return l;
          const quantity = l.quantity - 1;
          return { ...l, quantity, unitPriceCents: linePriceCents(l.product, quantity, l.priceTierOverride) };
        })
        .filter((l) => l.quantity > 0)
    );
  }

  // Typed directly into the cart's quantity field (see components/pos/Cart.tsx's
  // QuantityInput) — already clamped to [1, maxStock] there, clamped again here
  // as a second line of defense against a stale maxStock.
  function setQuantity(productId: string, quantity: number) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const clamped = Math.min(Math.max(1, quantity), l.maxStock);
        return { ...l, quantity: clamped, unitPriceCents: linePriceCents(l.product, clamped, l.priceTierOverride) };
      })
    );
  }

  // Manual tier pick from the cart's Detal/Mayor/Gran mayor selector — null
  // clears the override and goes back to auto-detecting from quantity.
  function setPriceTier(productId: string, tier: PriceTier | null) {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === productId
          ? { ...l, priceTierOverride: tier, unitPriceCents: linePriceCents(l.product, l.quantity, tier) }
          : l
      )
    );
  }

  function remove(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  function continueFromCustomer(info: CustomerInfo) {
    setCustomer(info);
    setStep("cart");
  }

  // Builds a stand-in Sale (matching what ReceiptView expects) from data
  // already on the client, for a sale that was queued offline and has no
  // real database row yet — control numbers are null until it actually
  // syncs. resolveSalePayments is the same shared helper the server itself
  // uses, so the currency breakdown shown here matches what will be
  // persisted once the sync succeeds.
  function buildPendingReceipt(customer: CustomerInfo): SaleWithItems {
    const now = new Date();
    const localId = crypto.randomUUID();
    const resolvedPayments =
      paymentStatus === "PAID"
        ? resolveSalePayments(
            paymentRows.map((r) => ({
              paymentMethod: r.paymentMethod,
              amount: Math.round(parseFloat(r.amount || "0") * 100),
              paidInForeignCurrency: r.paidInForeignCurrency,
              reference: r.reference || null,
            })),
            currencyCode,
            rate,
            exchangeRateEnabled,
            referenceCurrency
          )
        : [];

    const items: SaleItem[] = lines.map((l) => {
      const rawSubtotalCents = l.unitPriceCents * l.quantity;
      const itemDiscountCents = computeItemDiscountCents(rawSubtotalCents, discountValue);
      const subtotalCents = rawSubtotalCents - itemDiscountCents;
      return {
        id: crypto.randomUUID(),
        saleId: localId,
        productId: l.productId,
        productName: productById.get(l.productId)?.name ?? l.name,
        category: productById.get(l.productId)?.category ?? null,
        unitPriceCents: l.unitPriceCents,
        quantity: l.quantity,
        subtotalCents,
        discountCents: itemDiscountCents,
        // The real IVA breakdown is computed server-side once this offline
        // sale actually syncs (see completeSale) — this optimistic preview
        // never shows a tax breakdown, so these are placeholders only.
        taxCategory: "GENERAL",
        taxRatePercent: 0,
        baseCents: subtotalCents,
        taxCents: 0,
      };
    });

    const payments: SalePayment[] = resolvedPayments.map((p) => ({
      id: crypto.randomUUID(),
      saleId: localId,
      paymentMethod: p.paymentMethod,
      amountEurCents: p.amountEurCents,
      currencyCode: p.currencyCode,
      amountCurrencyCents: p.amountCurrencyCents,
      paidInForeignCurrency: p.paidInForeignCurrency,
      reference: p.reference,
      // Prisma's Decimal type can't be constructed client-side without
      // importing the runtime class just for this optimistic preview object
      // (never persisted) — null is a valid value and nothing reads it here.
      exchangeRate: null,
      createdAt: now,
    }));

    return {
      id: localId,
      createdAt: now,
      totalCents: total,
      discountCents: discountCentsTotal,
      paymentMethod: payments[0]?.paymentMethod ?? null,
      note: note.trim() || null,
      exchangeRate: rate,
      paidInForeignCurrency: payments.some((p) => p.currencyCode !== currencyCode),
      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      customerRif: customer.rif || null,
      customerId: null,
      paymentReference: payments[0]?.reference ?? null,
      paymentStatus,
      paidAt: paymentStatus === "PAID" ? now : null,
      paidExchangeRate: null,
      controlNumber: null,
      receiptControlNumber: null,
      voided: false,
      voidedAt: null,
      companyId: "",
      sellerId: null,
      sellerName,
      items,
      payments,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  function checkout() {
    if (!customer) return;
    setError(null);
    const saleInput: PendingSaleInput = {
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        priceTier: l.priceTierOverride ?? undefined,
      })),
      paymentStatus,
      payments:
        paymentStatus === "PAID"
          ? paymentRows.map((r) => ({
              paymentMethod: r.paymentMethod,
              amount: r.amount,
              paidInForeignCurrency: r.paidInForeignCurrency,
              reference: r.reference,
            }))
          : [],
      discountPercent: discountValue,
      customerFirstName: customer.firstName,
      customerLastName: customer.lastName,
      customerPhone: customer.phone,
      customerAddress: customer.address,
      customerRif: customer.rif || undefined,
      note: note.trim() || undefined,
    };

    async function queueOfflineSale(customerInfo: CustomerInfo) {
      await queueSale(saleInput, {
        totalCents: total,
        items: lines.map((l) => ({
          productName: productById.get(l.productId)?.name ?? l.name,
          category: productById.get(l.productId)?.category ?? null,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          subtotalCents: l.unitPriceCents * l.quantity - computeItemDiscountCents(l.unitPriceCents * l.quantity, discountValue),
        })),
        sellerName,
        note: note.trim() || null,
      });
      setCompletedSale(buildPendingReceipt(customerInfo));
      setPendingSync(true);
      setStep("receipt");
    }

    startTransition(async () => {
      if (!online) {
        await queueOfflineSale(customer);
        return;
      }
      try {
        const result = await completeSale(saleInput);
        if (!result.success) {
          setError(result.error);
          return;
        }
        const sale = await getSaleReceipt(result.saleId);
        if (sale) setCompletedSale(sale);
        setPendingSync(false);
        setStep("receipt");
        router.refresh();
      } catch {
        // A network-shaped failure mid-submit — queue it rather than risk
        // losing the sale; if it turns out the server had actually received
        // it, syncing later will surface a duplicate the seller can spot and
        // delete from Reportes (safer than silently dropping a real sale).
        await queueOfflineSale(customer);
      }
    });
  }

  function newSale() {
    setCustomer(null);
    setLines([]);
    setPaymentStatus("PAID");
    setPaymentRows(defaultPaymentSplitRows(0, rate, exchangeRateEnabled));
    setNote("");
    setDiscountPercent("0");
    setCompletedSale(null);
    setPendingSync(false);
    setStep("customer");
  }

  if (step === "receipt" && completedSale) {
    return (
      <ReceiptView
        sale={completedSale}
        rate={rate}
        currencyCode={currencyCode}
        exchangeRateEnabled={exchangeRateEnabled}
        referenceCurrency={referenceCurrency}
        printPaperSize={printPaperSize}
        company={company}
        onNewSale={newSale}
        pendingSync={pendingSync}
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
        <Cart
          lines={lines.map((l) => {
            const current = productById.get(l.productId);
            return {
              ...l,
              maxStock: current ? maxStockFor(current) : l.maxStock,
              product: current ?? l.product,
            };
          })}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          paymentStatus={paymentStatus}
          onPaymentStatusChange={setPaymentStatus}
          paymentRows={paymentRows}
          onPaymentRowsChange={setPaymentRows}
          onIncrement={increment}
          onDecrement={decrement}
          onSetQuantity={setQuantity}
          onSetPriceTier={setPriceTier}
          onRemove={remove}
          note={note}
          onNoteChange={setNote}
          discountPercent={discountPercent}
          onDiscountPercentChange={setDiscountPercent}
          onCheckout={checkout}
          isPending={isPending}
          error={error}
        />
      </div>
    </div>
  );
}
