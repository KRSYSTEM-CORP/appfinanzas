import { BanknoteIcon, CircleDollarSignIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PAYMENT_METHOD_LABELS, formatDate } from "@/lib/format";
import { formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { legacyCurrencyForPayment } from "@/lib/payment-currency";
import type { PaymentMethod, ReferenceCurrency } from "@prisma/client";

// The only fields of a sale this needs — loose enough for both the raw
// server-side sale (Decimal rates) and the plain one sent to Client
// Components (number rates).
type SalePaymentInfo = {
  payments: {
    paymentMethod: PaymentMethod;
    currencyCode: string | null;
    amountCurrencyCents: number | null;
    amountEurCents: number;
    reference: string | null;
    createdAt: Date;
    exchangeRate: unknown;
  }[];
  paymentMethod: PaymentMethod | null;
  paymentReference: string | null;
  paidAt: Date | null;
  paidExchangeRate: unknown;
};

// A single row's worth of "how they paid" — normalized from either the
// itemized sale.payments[] (current sales) or the legacy single
// paymentMethod/paymentReference/paidAt/paidExchangeRate fields (older sales
// from before payments were itemized), so PaymentMethodCell below never
// needs to know which shape it got.
type PaymentEntry = {
  method: PaymentMethod;
  currencyCode: string;
  amountCents: number | null;
  reference: string | null;
  date: Date | string | null;
  rate: number | null;
};

// Bolívares (the local currency) gets its own icon, distinct from any
// foreign/divisa currency (USD, EUR, USDT...) — the two payment "kinds" the
// user actually cares to tell apart at a glance, before opening the dialog
// for the full breakdown.
function paymentKind(currencyCode: string, localCurrencyCode: string): "local" | "foreign" {
  return currencyCode === localCurrencyCode ? "local" : "foreign";
}

export function PaymentMethodCell({
  sale,
  localCurrencyCode,
  referenceCurrency,
}: {
  sale: SalePaymentInfo;
  localCurrencyCode: string;
  referenceCurrency: ReferenceCurrency;
}) {
  const entries: PaymentEntry[] =
    sale.payments.length > 0
      ? sale.payments.map((p) => ({
          method: p.paymentMethod,
          currencyCode: p.currencyCode ?? legacyCurrencyForPayment(p.paymentMethod, referenceCurrency),
          amountCents: p.amountCurrencyCents ?? p.amountEurCents,
          reference: p.reference,
          date: p.createdAt,
          rate: p.exchangeRate != null ? Number(p.exchangeRate) : null,
        }))
      : sale.paymentMethod
        ? [
            {
              method: sale.paymentMethod,
              currencyCode: legacyCurrencyForPayment(sale.paymentMethod, referenceCurrency),
              amountCents: null,
              reference: sale.paymentReference,
              date: sale.paidAt,
              rate: sale.paidExchangeRate != null ? Number(sale.paidExchangeRate) : null,
            },
          ]
        : [];

  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const kinds = new Set(entries.map((e) => paymentKind(e.currencyCode, localCurrencyCode)));

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label="Ver detalle del pago"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 hover:bg-muted transition-colors"
          />
        }
      >
        {kinds.has("local") && <BanknoteIcon className="size-4 text-muted-foreground" />}
        {kinds.has("foreign") && <CircleDollarSignIcon className="size-4 text-muted-foreground" />}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cómo pagó el cliente</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm">
          {entries.map((e, i) => (
            <div key={i} className="flex flex-col gap-0.5 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium flex items-center gap-1.5">
                  {paymentKind(e.currencyCode, localCurrencyCode) === "local" ? (
                    <BanknoteIcon className="size-4 text-muted-foreground shrink-0" />
                  ) : (
                    <CircleDollarSignIcon className="size-4 text-muted-foreground shrink-0" />
                  )}
                  {PAYMENT_METHOD_LABELS[e.method]}
                </span>
                {e.amountCents != null && (
                  <span className="font-medium">{formatCurrencyCents(e.currencyCode, e.amountCents)}</span>
                )}
              </div>
              {e.reference && <span className="text-muted-foreground text-xs">Ref: {e.reference}</span>}
              {e.date && <span className="text-muted-foreground text-xs">{formatDate(e.date)}</span>}
              {e.rate != null && (
                <span className="text-muted-foreground text-xs">
                  Tasa {formatLocalCurrency(e.rate, localCurrencyCode)}
                </span>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
