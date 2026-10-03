"use client";

import { ReceiptTextIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { MasterDetail } from "@/components/shared/MasterDetail";
import { PaymentMethodCell } from "@/components/reports/PaymentMethodCell";
import { SaleActions } from "@/components/reports/SaleActions";
import { SaleDocumentButtons } from "@/components/reports/SaleDocumentButtons";
import { Price } from "@/components/money/Price";
import { PAYMENT_STATUS_LABELS, formatDateSlash } from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PlainSale } from "@/lib/sales-plain";

// Desktop-only list + detail panel for the sales history, shared by Reportes
// and Contabilidad → Ventas por vendedor through SalesTable. Phones keep the
// card layout rendered by SalesTable.
export function SalesMasterDetail({
  sales,
  remainingCentsBySaleId,
  company,
  rate,
  localCurrencyCode,
  localCurrencyName,
  exchangeRateEnabled,
  referenceCurrency,
  printPaperSize,
  showSellerColumn,
  empty,
}: {
  sales: PlainSale[];
  remainingCentsBySaleId: Record<string, number>;
  company: DeliveryNoteCompany;
  rate: number | null;
  localCurrencyCode: string;
  localCurrencyName: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
  showSellerColumn: boolean;
  empty: ReactNode;
}) {
  const nameOf = (s: PlainSale) =>
    s.customerFirstName ? `${s.customerFirstName} ${s.customerLastName ?? ""}`.trim() : "—";
  const totalRate = (s: PlainSale) => s.paidExchangeRate ?? s.exchangeRate ?? rate;
  const statusBadge = (s: PlainSale) =>
    s.paymentStatus === "CREDIT" ? (
      <Badge variant="destructive">{PAYMENT_STATUS_LABELS.CREDIT}</Badge>
    ) : (
      <Badge variant="success">{PAYMENT_STATUS_LABELS.PAID}</Badge>
    );

  return (
    <MasterDetail
      items={sales}
      label="Ventas"
      empty={empty}
      renderRow={(s) => (
        <>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <ReceiptTextIcon className="size-4 text-muted-foreground/60" />
          </span>
          <span className={`min-w-0 flex-1 ${s.voided ? "opacity-60" : ""}`}>
            <span className="block truncate text-sm font-semibold">{nameOf(s)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {formatDateSlash(s.createdAt)}
              {showSellerColumn && s.sellerName ? ` · ${s.sellerName}` : ""}
              {s.voided && " · Anulada"}
            </span>
          </span>
          {statusBadge(s)}
          <span className="flex w-28 shrink-0 justify-end text-sm">
            <Price
              eurCents={s.totalCents}
              rate={totalRate(s)}
              currencyCode={localCurrencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              className="items-end"
            />
          </span>
        </>
      )}
      renderDetail={(s) => {
        const remaining = remainingCentsBySaleId[s.id] ?? s.totalCents;
        return (
          <>
            <div className="flex flex-col gap-0.5">
              <h3 className="text-lg font-semibold leading-tight">{nameOf(s)}</h3>
              <p className="text-sm text-muted-foreground">
                Venta Nº {s.controlNumber ?? "—"}
                {s.voided && (
                  <Badge variant="destructive" className="ml-2 align-middle">
                    Anulada
                  </Badge>
                )}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Fecha</dt>
                <dd className="font-medium">{formatDateSlash(s.createdAt)}</dd>
              </div>
              {showSellerColumn && (
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Vendedor</dt>
                  <dd className="font-medium">{s.sellerName ?? "—"}</dd>
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Artículos</dt>
                <dd className="font-medium">{s.items.reduce((sum, i) => sum + i.quantity, 0)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Estado</dt>
                <dd>{statusBadge(s)}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">Método de pago</dt>
                <dd>
                  <PaymentMethodCell sale={s} localCurrencyCode={localCurrencyCode} referenceCurrency={referenceCurrency} />
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Moneda</dt>
                <dd>
                  {!exchangeRateEnabled ? (
                    <Badge variant="outline">{referenceCurrency}</Badge>
                  ) : s.paidInForeignCurrency ? (
                    <Badge variant="secondary">Divisas</Badge>
                  ) : (
                    <Badge variant="outline">{localCurrencyName}</Badge>
                  )}
                </dd>
              </div>
              {s.paymentStatus === "CREDIT" && remaining !== s.totalCents && (
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Saldo pendiente</dt>
                  <dd className="font-medium text-warning">
                    {exchangeRateEnabled && rate != null
                      ? formatLocalCurrency(eurCentsToLocal(remaining, rate), localCurrencyCode)
                      : formatCurrencyCents(referenceCurrency, remaining)}
                  </dd>
                </div>
              )}
              <div className="col-span-2 flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="flex">
                  <Price
                    eurCents={s.totalCents}
                    rate={totalRate(s)}
                    currencyCode={localCurrencyCode}
                    exchangeRateEnabled={exchangeRateEnabled}
                    referenceCurrency={referenceCurrency}
                    size="lg"
                  />
                </dd>
              </div>
            </dl>
            <div className="flex flex-col gap-3 border-t pt-4">
              <SaleDocumentButtons
                sale={s}
                company={company}
                currentRate={rate}
                currencyCode={localCurrencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
                printPaperSize={printPaperSize}
              />
              <SaleActions
                saleId={s.id}
                voided={s.voided}
                paymentStatus={s.paymentStatus}
                totalCents={s.totalCents}
                remainingCents={remaining}
                currentRate={rate}
                currencyCode={localCurrencyCode}
                exchangeRateEnabled={exchangeRateEnabled}
                referenceCurrency={referenceCurrency}
              />
            </div>
          </>
        );
      }}
    />
  );
}
