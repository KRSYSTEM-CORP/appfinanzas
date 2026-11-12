"use client";

import { whatsappLink } from "@/lib/marketing";
import { ReceiptTextIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PrintPaperSize, ReferenceCurrency } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { PaymentMethodCell } from "@/components/reports/PaymentMethodCell";
import { SaleActions } from "@/components/reports/SaleActions";
import { SaleDocumentButtons } from "@/components/reports/SaleDocumentButtons";
import { Price } from "@/components/money/Price";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, formatDateSlash } from "@/lib/format";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import type { PlainSale } from "@/lib/sales-plain";

// Desktop-only list + detail panel for the sales history, shared by Reportes
// and Contabilidad → Ventas por vendedor through SalesTable. Phones keep the
// card layout rendered by SalesTable.
const CHANNEL_LABELS: Record<string, string> = { MOSTRADOR: "Mostrador", DELIVERY: "Delivery", PICKUP: "Pick-up", ONLINE: "Online" };

// Nº · hora · canal · método, como las columnas de la tabla de la preview.
function saleMeta(s: { controlNumber: number | null; createdAt: Date | string; channel?: string | null; payments: { paymentMethod: keyof typeof PAYMENT_METHOD_LABELS }[] }): string {
  const time = new Intl.DateTimeFormat("es-VE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Caracas" }).format(new Date(s.createdAt));
  const methods = [...new Set(s.payments.map((p) => PAYMENT_METHOD_LABELS[p.paymentMethod]))].join(" + ");
  return [`#${s.controlNumber ?? "—"}`, time, s.channel ? CHANNEL_LABELS[s.channel] ?? s.channel : null, methods || null].filter(Boolean).join(" · ");
}

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
  canManage,
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
  canManage: boolean;
  showSellerColumn: boolean;
  empty: ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openSale = openId ? sales.find((x) => x.id === openId) ?? null : null;
  const timeOf = (d: Date | string) =>
    new Intl.DateTimeFormat("es-VE", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/Caracas" }).format(new Date(d));
  const methodsOf = (s: PlainSale) => [...new Set(s.payments.map((p) => PAYMENT_METHOD_LABELS[p.paymentMethod]))].join(" + ") || "—";
  const nameOf = (s: PlainSale) =>
    s.customerFirstName ? `${s.customerFirstName} ${s.customerLastName ?? ""}`.trim() : "—";
  const totalRate = (s: PlainSale) => s.paidExchangeRate ?? s.exchangeRate ?? rate;
  const statusBadge = (s: PlainSale) =>
    s.paymentStatus === "CREDIT" ? (
      <Badge variant="destructive">{PAYMENT_STATUS_LABELS.CREDIT}</Badge>
    ) : (
      <Badge variant="success">{PAYMENT_STATUS_LABELS.PAID}</Badge>
    );

  const detail = (s: PlainSale) => {
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
            {s.paymentStatus === "CREDIT" && !s.voided && s.customerPhone && s.customerPhone !== "0000-0000000" && (
              <a
                href={whatsappLink(
                  s.customerPhone,
                  `Hola ${s.customerFirstName ?? ""} 👋 te escribimos de ${company.name}. Tienes un saldo pendiente de ${
                    exchangeRateEnabled && rate != null
                      ? formatLocalCurrency(eurCentsToLocal(remaining, rate), localCurrencyCode)
                      : formatCurrencyCents(referenceCurrency, remaining)
                  } por la venta Nº ${s.controlNumber ?? ""}. ¡Gracias!`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-full border border-primary px-3.5 py-2 text-sm font-semibold text-primary"
              >
                Recordar pago por WhatsApp
              </a>
            )}
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
                canManage={canManage}
                hasInvoice={s.invoiceNumber != null}
              />
            </div>
          </>
        );
      };

  return (
    <>
      <div className="md:hidden">
        <MasterDetail
      items={sales}
      label="Ventas"
      renderRowMobile={(s) => (
        <MobileRow
          title={nameOf(s)}
          meta={`${formatDateSlash(s.createdAt)}${showSellerColumn && s.sellerName ? ` · ${s.sellerName}` : ""}${s.voided ? " · Anulada" : ""}`}
          badge={statusBadge(s)}
          amount={
            <Price
              eurCents={s.totalCents}
              rate={totalRate(s)}
              currencyCode={localCurrencyCode}
              exchangeRateEnabled={exchangeRateEnabled}
              referenceCurrency={referenceCurrency}
              className="items-end"
            />
          }
        />
      )}
      empty={empty}
      renderRow={(s) => (
        <>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <ReceiptTextIcon className="size-4 text-muted-foreground/60" />
          </span>
          <span className={`min-w-0 flex-1 ${s.voided ? "opacity-60" : ""}`}>
            <span className="block truncate text-sm font-semibold">{nameOf(s)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {formatDateSlash(s.createdAt)} · {saleMeta(s)}
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
      renderDetail={detail}
    />
      </div>
      <div className="hidden md:block">
        {sales.length === 0 ? (
          empty
        ) : (
          <>
            <div className="overflow-x-auto rounded-[20px] bg-card shadow-(--shadow-card)">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="px-4 py-3 font-medium">N.º</th>
                    <th className="px-3 py-3 font-medium">Hora</th>
                    <th className="px-3 py-3 font-medium">Cliente</th>
                    <th className="px-3 py-3 font-medium">Canal</th>
                    <th className="px-3 py-3 font-medium">Método</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr
                      key={s.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver detalle de la venta ${s.controlNumber ?? ""} de ${nameOf(s)}`}
                      onClick={() => setOpenId(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpenId(s.id);
                        }
                      }}
                      className={`cursor-pointer border-t border-border/70 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none ${s.voided ? "opacity-60" : ""}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums">#{s.controlNumber ?? "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-muted-foreground">
                        {formatDateSlash(s.createdAt)} · {timeOf(s.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <span className="block max-w-56 truncate font-medium">{nameOf(s)}</span>
                        {showSellerColumn && s.sellerName && <span className="block text-xs text-muted-foreground">{s.sellerName}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{s.channel ? CHANNEL_LABELS[s.channel] ?? s.channel : "—"}</td>
                      <td className="px-3 py-3 text-muted-foreground">{methodsOf(s)}</td>
                      <td className="px-3 py-3">{s.voided ? <Badge variant="destructive">Anulada</Badge> : statusBadge(s)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right [&_*]:whitespace-nowrap">
                        <Price
                          eurCents={s.totalCents}
                          rate={totalRate(s)}
                          currencyCode={localCurrencyCode}
                          exchangeRateEnabled={exchangeRateEnabled}
                          referenceCurrency={referenceCurrency}
                          className="items-end"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Dialog open={openSale != null} onOpenChange={(o) => !o && setOpenId(null)}>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Detalle de la venta</DialogTitle>
                </DialogHeader>
                {openSale && <div className="flex flex-col gap-4">{detail(openSale)}</div>}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </>
  );
}
