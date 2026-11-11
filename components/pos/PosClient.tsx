"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentStatus } from "@prisma/client";
import type { ListedProduct } from "@/lib/product-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { searchCustomers } from "@/lib/actions/customers";
import { CustomerForm, type CustomerInfo } from "@/components/pos/CustomerForm";
import { ProductPicker } from "@/components/pos/ProductPicker";
import { Cart, type CartLine } from "@/components/pos/Cart";
import { PayScreen } from "@/components/pos/PayScreen";
import { ReceiptView } from "@/components/pos/ReceiptView";
import { defaultPaymentSplitRows, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";
import { useDefaultPaymentRow } from "@/components/payments/useDefaultPaymentRow";
import { completeSale, getSaleReceipt } from "@/lib/actions/sales";
import { SALE_CHANNEL_LABELS } from "@/lib/format";
import type { QuoteForConversion } from "@/lib/actions/quotes";
import { computeItemDiscountCents } from "@/lib/discount";
import { useOnlineStatus } from "@/lib/offline/use-online-status";
import { queueSale, type PendingSaleInput } from "@/lib/offline/sync";
import { useCatalogSync } from "@/lib/offline/use-catalog-sync";
import { buildPendingReceipt } from "@/lib/offline/pending-receipt";
import { useCart } from "@/lib/pos/use-cart";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PaymentAccountRow } from "@/lib/actions/payment-accounts";
import type { PaymentMethod, PrintPaperSize, ReferenceCurrency, SaleChannel } from "@prisma/client";

type SaleWithItems = NonNullable<Awaited<ReturnType<typeof getSaleReceipt>>>;
type Step = "customer" | "cart" | "pay" | "receipt";

function PosSession({
  paymentAccounts = [],
  products,
  rate,
  currencyCode,
  exchangeRateEnabled,
  referenceCurrency,
  igtfRatePercent = null,
  printPaperSize,
  categories,
  company,
  sellerName,
  initialQuote,
  accountTabs,
  onHold,
  topMethod = null,
  companyId,
  companyName,
  branchId,
  branchName,
  ivaGeneralRatePercent,
  ivaReducedRatePercent,
}: {
  paymentAccounts?: PaymentAccountRow[];
  products: ListedProduct[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  // Set only for IGTF agents (see lib/igtf.ts).
  igtfRatePercent?: number | null;
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
  // Pestañas de cuentas (las pone PosClient dentro de la tarjeta de venta).
  accountTabs?: React.ReactNode;
  // Deja esta cuenta en espera y abre otra (la pone PosClient).
  onHold?: () => void;
  // Método de pago más usado hoy, para marcarlo en la pantalla de cobro.
  topMethod?: PaymentMethod | null;
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
  // Como en la preview: se entra directo al catálogo y el cliente se pide al cobrar
// (registrar uno, elegirlo en el Directorio o «Cliente general» solo desde el Directorio).
const [step, setStep] = useState<Step>("cart");
  const [dialog, setDialog] = useState<null | "register" | "directory">(null);
  const [fromPay, setFromPay] = useState(false);
  const [dirQuery, setDirQuery] = useState("");
  const [dirResults, setDirResults] = useState<{ id: string; firstName: string; lastName: string; phone: string; address: string | null; rif: string | null }[]>([]);
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
  const [channel, setChannel] = useState<SaleChannel>("MOSTRADOR");
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
  // A 100%-discounted sale has nothing to collect — see Cart's isExonerated
  // and checkout()/buildReceiptPreview below, which both use this to force
  // paymentStatus to PAID with no payment rows instead of whatever the
  // cashier had selected before applying the exoneration.
  const exonerated = total <= 0;

  // Keep the single default payment row in sync with the cart total as
  // products are added/removed, so the common single-method case never
  // requires the user to manually retype the amount. Once a second row is
  // added (an intentional split), amounts are fully user-controlled.
  useDefaultPaymentRow(total, rate, exchangeRateEnabled, setPaymentRows);

  function addProduct(product: ListedProduct) {
    setError(null);
    addProductToCart(product);
  }

  function continueFromCustomer(info: CustomerInfo) {
    setCustomer(info);
    // Si venía de «Cobrar», sigue directo a la pantalla de cobro.
    setStep(fromPay && lines.length > 0 ? "pay" : "cart");
    setDialog(null);
    setFromPay(false);
  }

  function useGeneralCustomer() {
    continueFromCustomer({ firstName: "Cliente", lastName: "general", phone: "0000-0000000", address: "Venta sin datos", rif: "" });
  }

  function runDirectorySearch(q: string) {
    setDirQuery(q);
    if (q.trim().length < 2) {
      setDirResults([]);
      return;
    }
    searchCustomers(q)
      .then((r) => setDirResults(r.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, address: c.address, rif: c.rif }))))
      .catch(() => setDirResults([]));
  }

  // Sin cliente no se cobra: se abre «Registrar cliente» con el atajo al Directorio.
  function requestCheckout() {
    if (!customer) {
      setFromPay(true);
      setDialog("register");
      return;
    }
    setError(null);
    setStep("pay");
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
      paymentStatus: exonerated ? "PAID" : paymentStatus,
      paymentRows: exonerated ? [] : paymentRows,
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
    // One key per checkout, sent on the online attempt AND kept in the
    // offline queue: if the server saved the sale but the response never
    // arrived, the queued retry resolves to that same sale instead of
    // creating (and charging, and discounting stock for) a second one.
    const saleInput: PendingSaleInput = {
      idempotencyKey: crypto.randomUUID(),
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        priceTier: l.priceTierOverride ?? undefined,
      })),
      paymentStatus: exonerated ? "PAID" : paymentStatus,
      channel,
      payments:
        !exonerated && paymentStatus === "PAID"
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
      await queueSale({ ...saleInput, offlineExchangeRate: rate ?? undefined }, {
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
      let result: Awaited<ReturnType<typeof completeSale>>;
      try {
        result = await completeSale(saleInput);
      } catch {
        // A network-shaped failure mid-submit — queue it rather than risk
        // losing the sale. The idempotency key above makes the later sync
        // return the same sale if the server had actually saved it.
        await queueOfflineSale(customer);
        return;
      }
      if (!result.success) {
        setError(result.error);
        return;
      }
      // The sale IS saved from here on: a failure loading the receipt must
      // never send it to the offline queue again.
      try {
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
        setCompletedSale(buildReceiptPreview(customer));
        setPendingSync(false);
        setStep("receipt");
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
    setStep("cart");
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

  if (step === "pay" && customer) {
    const isGeneral = customer.phone === "0000-0000000";
    return (
      <div className="flex h-full flex-col gap-3">
        {accountTabs}
        <div className="min-h-0 flex-1">
          <PayScreen
            customerName={`${customer.firstName} ${customer.lastName}`}
            rawTotal={rawTotal}
            total={total}
            discountPercent={discountPercent}
            onDiscountPercentChange={setDiscountPercent}
            paymentStatus={paymentStatus}
            onPaymentStatusChange={setPaymentStatus}
            paymentRows={paymentRows}
            onPaymentRowsChange={setPaymentRows}
            note={note}
            onNoteChange={setNote}
            paymentAccounts={paymentAccounts}
            rate={rate}
            currencyCode={currencyCode}
            exchangeRateEnabled={exchangeRateEnabled}
            referenceCurrency={referenceCurrency}
            igtfRatePercent={igtfRatePercent}
            isGeneralCustomer={isGeneral}
            topMethod={topMethod}
            isPending={isPending}
            error={error}
            onBack={() => setStep("cart")}
            onConfirm={checkout}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      <div className={`grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6 md:flex-1 md:min-h-0 ${lines.length ? "pb-[calc(var(--tabbar-h)+5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}>
        <ProductPicker
          products={products}
          rate={rate}
          currencyCode={currencyCode}
          exchangeRateEnabled={exchangeRateEnabled}
          referenceCurrency={referenceCurrency}
          categories={categories}
          onAdd={addProduct}
        />
        <div className="flex min-h-0 flex-col gap-3 rounded-[22px] bg-card p-5 shadow-(--shadow-card) md:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Venta actual</h2>
              <p className="text-[13px] text-muted-foreground">
                {lines.reduce((n, l) => n + l.quantity, 0)} {lines.reduce((n, l) => n + l.quantity, 0) === 1 ? "producto" : "productos"} · {SALE_CHANNEL_LABELS[channel]}
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={lines.length === 0} onClick={() => { resetCart(); }}>
              Vaciar
            </Button>
          </div>
          <div role="radiogroup" aria-label="Canal de venta" className="flex flex-wrap gap-2">
            {(Object.keys(SALE_CHANNEL_LABELS) as SaleChannel[]).map((ch) => (
              <button
                key={ch}
                type="button"
                role="radio"
                aria-checked={channel === ch}
                onClick={() => setChannel(ch)}
                className={`min-h-[38px] rounded-xl border-2 px-3.5 text-[13px] font-bold transition-colors ${
                  channel === ch ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted text-foreground hover:bg-muted/70"
                }`}
              >
                {SALE_CHANNEL_LABELS[ch]}
              </button>
            ))}
          </div>
          {accountTabs}
          {customer && (
            <div className="min-w-0 rounded-2xl bg-muted px-3.5 py-2.5 text-sm">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cliente de esta venta</p>
              <p className="truncate font-semibold">
                {customer.firstName} {customer.lastName}
                {customer.phone && customer.phone !== "0000-0000000" && <span className="font-normal text-muted-foreground"> · {customer.phone}</span>}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="lg" onClick={() => { setFromPay(false); setDialog("register"); }}>
              + Registrar cliente
            </Button>
            <Button type="button" size="lg" variant="outline" onClick={() => { setDirQuery(""); setDirResults([]); setDialog("directory"); }}>
              Directorio
            </Button>
          </div>
        <Cart
          bare
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
          igtfRatePercent={igtfRatePercent}
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
          channel={channel}
          onChannelChange={setChannel}
          paymentAccounts={paymentAccounts}
          discountPercent={discountPercent}
          onDiscountPercentChange={setDiscountPercent}
          onCheckout={requestCheckout}
          onHold={onHold}
          isPending={isPending}
          error={error}
        />
        </div>
      </div>

      <Dialog open={dialog === "register"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar cliente</DialogTitle>
            <DialogDescription>Se guarda en tu CRM y se usa en esta venta.</DialogDescription>
          </DialogHeader>
          <CustomerForm bare initial={customer ?? undefined} onContinue={continueFromCustomer} title="Datos del cliente" subtitle="Nombre, apellido, dirección y teléfono son obligatorios." submitLabel="Guardar y usar en la venta" />
          {fromPay && (
            <div className="flex flex-col gap-2 border-t pt-3">
              <p className="text-xs text-muted-foreground">¿Venta sin datos? Elige «Cliente general» en el Directorio.</p>
              <Button type="button" variant="outline" onClick={() => { setDirQuery(""); setDirResults([]); setDialog("directory"); }}>
                Abrir Directorio
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "directory"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Directorio de clientes</DialogTitle>
            <DialogDescription>Busca un cliente o usa «Cliente general» para una venta sin datos.</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={dirQuery} onChange={(e) => runDirectorySearch(e.target.value)} placeholder="Buscar por nombre o apellido" />
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            <li>
              <button type="button" onClick={useGeneralCustomer} className="flex w-full flex-col rounded-xl bg-muted p-3 text-left hover:bg-muted/70">
                <span className="font-semibold">Cliente general</span>
                <span className="text-xs text-muted-foreground">Venta sin datos</span>
              </button>
            </li>
            {dirResults.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => continueFromCustomer({ firstName: c.firstName, lastName: c.lastName, phone: c.phone, address: c.address ?? "", rif: c.rif ?? "" })}
                  className="flex w-full flex-col rounded-xl p-3 text-left hover:bg-muted"
                >
                  <span className="font-semibold">{c.firstName} {c.lastName}</span>
                  <span className="text-xs text-muted-foreground">{c.phone}</span>
                </button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" onClick={() => { setFromPay(false); setDialog("register"); }}>
            + Registrar cliente nuevo
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// Varias cuentas abiertas a la vez (como en la preview): cada una es una venta
// independiente con su propio carrito, cliente y pagos. Las inactivas siguen
// montadas (ocultas) para no perder lo que llevan.
export function PosClient(props: React.ComponentProps<typeof PosSession>) {
  const [accounts, setAccounts] = useState<number[]>([1]);
  const [active, setActive] = useState(1);
  const [nextId, setNextId] = useState(2);

  function addAccount() {
    setAccounts((a) => [...a, nextId]);
    setActive(nextId);
    setNextId((n) => n + 1);
  }

  function closeAccount(id: number) {
    if (accounts.length === 1) return;
    if (!window.confirm("¿Cerrar esta cuenta? Se pierde lo que lleva sin cobrar.")) return;
    const left = accounts.filter((a) => a !== id);
    setAccounts(left);
    if (active === id) setActive(left[0]);
  }

  const tabs = (
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Cuentas abiertas">
        {accounts.map((id, i) => (
          <span key={id} className="inline-flex items-center">
            <button
              type="button"
              role="tab"
              aria-selected={active === id}
              onClick={() => setActive(id)}
              className={`min-h-[38px] rounded-xl border-2 px-3.5 text-[13px] font-bold transition-colors ${
                active === id ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted text-foreground hover:bg-muted/70"
              }`}
            >
              Cuenta {i + 1}
            </button>
            {accounts.length > 1 && (
              <button type="button" onClick={() => closeAccount(id)} aria-label={`Cerrar cuenta ${i + 1}`} className="ml-1 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted">
                ×
              </button>
            )}
          </span>
        ))}
        <button
          type="button"
          onClick={addAccount}
          className="min-h-[38px] rounded-xl border-2 border-dashed border-border px-3.5 text-[13px] font-bold text-foreground hover:bg-muted"
        >
          + Nueva cuenta
        </button>
      </div>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {accounts.map((id) => (
        <div key={id} className={id === active ? "min-h-0 flex-1" : "hidden"}>
          <PosSession {...props} initialQuote={id === 1 ? props.initialQuote : null} accountTabs={tabs} onHold={addAccount} />
        </div>
      ))}
    </div>
  );
}
