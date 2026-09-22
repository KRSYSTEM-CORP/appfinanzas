"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product, PaymentStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CustomerForm, type CustomerInfo } from "@/components/pos/CustomerForm";
import { ProductPicker } from "@/components/pos/ProductPicker";
import { Cart, type CartLine } from "@/components/pos/Cart";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { defaultPaymentSplitRows, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { completeSale, getSaleReceipt } from "@/lib/actions/sales";
import type { QuoteForConversion } from "@/lib/actions/quotes";
import { computeItemDiscountCents } from "@/lib/discount";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { queueSale, type PendingSaleInput } from "@/lib/offline/sync";
import { useCatalogSync } from "@/lib/offline/use-catalog-sync";
import { buildPendingReceipt } from "@/lib/offline/pending-receipt";
import { useCart } from "@/lib/pos/use-cart";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
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
  initialQuote,
  companyId,
  companyName,
  branchId,
  branchName,
  ivaGeneralRatePercent,
  ivaReducedRatePercent,
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
  // Prefills customer + cart from an existing Quote (see the "Facturar"
  // button in QuoteHistoryTable and ?fromQuote= in app/pos/page.tsx) —
  // resolved server-side against CURRENT product prices/stock, not the
  // quote's frozen snapshot. Lines whose product no longer exists in
  // `products` (deleted/deactivated since the quote was made) are silently
  // dropped here too, as a second line of defense on top of the filtering
  // already done in getQuoteForConversion.
  initialQuote?: QuoteForConversion | null;
  companyId: string;
  // Only used to keep this terminal's offline catalog snapshot up to date
  // (see useCatalogSync below) — nothing here changes this component's own
  // online behavior.
  companyName: string;
  branchId: string | null;
  branchName: string | null;
  ivaGeneralRatePercent: number;
  ivaReducedRatePercent: number;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  // Keeps this terminal's product list (stock/prices) in sync with sales and
  // catalog edits made from any other open terminal for the same business.
  useLiveRefresh(`pos:${companyId}`, "product");
  useLiveRefresh(`pos:${companyId}`, "sale");
  // Keeps IndexedDB's offline catalog snapshot warm for this branch — see
  // components/pos/PosOfflineClient.tsx, the screen that reads it back when
  // this same page can't be reached at all (no network at navigation time).
  useCatalogSync({
    branchId,
    branchName,
    companyId,
    companyName,
    sellerName,
    products,
    categories,
    rate,
    currencyCode,
    exchangeRateEnabled,
    referenceCurrency,
    printPaperSize,
    ivaGeneralRatePercent,
    ivaReducedRatePercent,
    company,
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const initialLines: CartLine[] = (initialQuote?.lines ?? [])
    .map((l): CartLine | null => {
      const product = productById.get(l.productId);
      if (!product) return null;
      return {
        productId: product.id,
        name: product.name,
        unitPriceCents: l.unitPriceCents,
        quantity: l.quantity,
        maxStock: product.trackStock ? product.stock : Infinity,
        product,
        priceTierOverride: null,
      };
    })
    .filter((l): l is CartLine => l != null);
  const [step, setStep] = useState<Step>(initialQuote ? "cart" : "customer");
  const [customer, setCustomer] = useState<CustomerInfo | null>(
    initialQuote
      ? {
          firstName: initialQuote.customerFirstName,
          lastName: initialQuote.customerLastName,
          phone: initialQuote.customerPhone,
          address: initialQuote.customerAddress,
          rif: "",
        }
      : null
  );
  const {
    lines,
    maxStockFor,
    addProduct: addProductToCart,
    increment,
    decrement,
    setQuantity,
    setPriceTier,
    remove,
    reset: resetCart,
  } = useCart(initialLines);
  const [quoteId] = useState<string | null>(initialQuote?.quoteId ?? null);
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

  function addProduct(product: Product) {
    setError(null);
    addProductToCart(product);
  }

  function continueFromCustomer(info: CustomerInfo) {
    setCustomer(info);
    setStep("cart");
  }

  // Builds a stand-in Sale (matching what ReceiptView expects) from data
  // already on the client, for a sale that was queued offline and has no
  // real database row yet — control numbers are null until it actually
  // syncs. Shared with components/pos/PosOfflineClient.tsx (see
  // lib/offline/pending-receipt.ts) so both compute the exact same real IVA
  // breakdown from the cached rates, not a placeholder.
  function buildReceiptPreview(customer: CustomerInfo): SaleWithItems {
    return buildPendingReceipt({
      lines: lines.map((l) => {
        const product = productById.get(l.productId);
        return {
          productId: l.productId,
          name: product?.name ?? l.name,
          category: product?.category ?? null,
          taxCategory: product?.taxCategory ?? "GENERAL",
          unitPriceCents: l.unitPriceCents,
          quantity: l.quantity,
        };
      }),
      customer,
      paymentStatus,
      paymentRows,
      discountPercent: discountValue,
      note,
      sellerName,
      rate,
      currencyCode,
      exchangeRateEnabled,
      referenceCurrency,
      ivaGeneralRatePercent,
      ivaReducedRatePercent,
    });
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
      quoteId: quoteId ?? undefined,
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
      setCompletedSale(buildReceiptPreview(customerInfo));
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
        // Plain refresh() would re-render this route with whatever query
        // string is still in the address bar — for a sale completed via
        // ?fromQuote=<id>, that would re-run getQuoteForConversion and show
        // its "ya fue facturado" error on top of the receipt that just
        // succeeded. replace() drops the query string too, so the receipt
        // is the only thing on screen.
        router.replace("/pos");
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
    resetCart();
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
