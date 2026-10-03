"use client";

import { ShoppingBagIcon } from "lucide-react";
import type { ReferenceCurrency } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { PurchaseActions } from "@/components/purchases/PurchaseActions";
import { formatCurrencyCents } from "@/lib/currencies";
import { formatDate, PAYMENT_METHOD_LABELS, PURCHASE_PAYMENT_STATUS_LABELS } from "@/lib/format";
import type { listRecentPurchases } from "@/lib/actions/purchases";

type Purchase = Awaited<ReturnType<typeof listRecentPurchases>>[number];

// Desktop-only list + detail panel for the purchase history (phones keep the
// card list rendered by the page).
export function PurchaseMasterDetail({
  purchases,
  referenceCurrency,
}: {
  purchases: Purchase[];
  referenceCurrency: ReferenceCurrency;
}) {
  const supplierOf = (p: Purchase) => p.supplier?.name ?? p.manualSupplierName ?? "—";
  const statusBadge = (p: Purchase) => (
    <Badge variant={p.paymentStatus === "PAID" ? "success" : "destructive"}>
      {PURCHASE_PAYMENT_STATUS_LABELS[p.paymentStatus]}
    </Badge>
  );

  return (
    <MasterDetail
      items={purchases}
      label="Compras"
      renderRowMobile={(p) => (
        <MobileRow
          title={supplierOf(p)}
          meta={`Nº ${p.controlNumber ?? "—"} · ${formatDate(p.createdAt)}${p.voided ? " · Anulada" : ""}`}
          badge={statusBadge(p)}
          amount={<span className="font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, p.totalCents)}</span>}
        />
      )}
      renderRow={(p) => (
        <>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
            <ShoppingBagIcon className="size-4 text-muted-foreground/60" />
          </span>
          <span className={`min-w-0 flex-1 ${p.voided ? "opacity-60" : ""}`}>
            <span className="block truncate text-sm font-semibold">{supplierOf(p)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              Nº {p.controlNumber ?? "—"} · {formatDate(p.createdAt)}
              {p.voided && " · Anulada"}
            </span>
          </span>
          {statusBadge(p)}
          <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums">
            {formatCurrencyCents(referenceCurrency, p.totalCents)}
          </span>
        </>
      )}
      renderDetail={(p) => (
        <>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-lg font-semibold leading-tight">{supplierOf(p)}</h3>
            <p className="text-sm text-muted-foreground">
              Compra Nº {p.controlNumber ?? "—"}
              {p.voided && (
                <Badge variant="destructive" className="ml-2 align-middle">
                  Anulada
                </Badge>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Fecha</dt>
              <dd className="font-medium">{formatDate(p.createdAt)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Factura proveedor</dt>
              <dd className="font-medium">{p.supplierInvoiceNo ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Base imponible</dt>
              <dd className="font-medium tabular-nums">{formatCurrencyCents(referenceCurrency, p.baseImponibleCents)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">IVA</dt>
              <dd className="font-medium tabular-nums">
                {formatCurrencyCents(referenceCurrency, p.taxCents)}
                {p.ivaRetainedCents > 0 && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Retenido: {formatCurrencyCents(referenceCurrency, p.ivaRetainedCents)}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, p.totalCents)}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Estado</dt>
              <dd className="flex flex-col gap-1">
                <span>{statusBadge(p)}</span>
                {p.payments.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {p.payments.map((pay) => PAYMENT_METHOD_LABELS[pay.paymentMethod]).join(", ")}
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <div className="border-t pt-4 [&_.justify-end]:justify-start text-left">
            <PurchaseActions purchaseId={p.id} paymentStatus={p.paymentStatus} voided={p.voided} />
          </div>
        </>
      )}
      empty={
        <div className="flex flex-col items-center gap-3 rounded-lg border bg-card py-14 text-center shadow-xs">
          <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
            <ShoppingBagIcon className="size-5" />
          </div>
          <p className="text-sm font-medium">Aún no tienes compras</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            Registra tu primera compra a un proveedor para aumentar el stock.
          </p>
        </div>
      }
    />
  );
}
