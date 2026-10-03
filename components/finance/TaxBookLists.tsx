"use client";

import { BookOpenIcon, PackageIcon, ReceiptTextIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ReferenceCurrency } from "@prisma/client";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { formatCurrencyCents } from "@/lib/currencies";
import { formatDate } from "@/lib/format";
import type { getSalesTaxBook, getPurchasesTaxBook } from "@/lib/actions/tax-book";

type SaleEntry = Awaited<ReturnType<typeof getSalesTaxBook>>[number];
type PurchaseEntry = Awaited<ReturnType<typeof getPurchasesTaxBook>>[number];

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function TotalsStrip({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t bg-muted/40 px-3.5 py-2.5 text-sm">
      <span className="font-semibold">Totales</span>
      {items.map((i) => (
        <span key={i.label} className="tabular-nums">
          <span className="text-muted-foreground">{i.label} </span>
          <span className="font-semibold">{i.value}</span>
        </span>
      ))}
    </div>
  );
}

function EntryIcon({ icon: Icon }: { icon: typeof BookOpenIcon }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
      <Icon className="size-4 text-muted-foreground/60" />
    </span>
  );
}

export function SalesBookList({
  sales,
  referenceCurrency,
  totals,
  empty,
}: {
  sales: SaleEntry[];
  referenceCurrency: ReferenceCurrency;
  totals: { base: number; tax: number; total: number };
  empty: ReactNode;
}) {
  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);
  const nameOf = (s: SaleEntry) => `${s.customerFirstName ?? ""} ${s.customerLastName ?? ""}`.trim() || "—";
  return (
    <MasterDetail
      items={sales}
      label="Libro de Ventas"
      empty={empty}
      footer={
        <TotalsStrip
          items={[
            { label: "Base", value: money(totals.base) },
            { label: "IVA", value: money(totals.tax) },
            { label: "Total", value: money(totals.total) },
          ]}
        />
      }
      renderRowMobile={(s) => (
        <MobileRow
          title={nameOf(s)}
          meta={`${formatDate(s.createdAt)} · Nº ${s.invoiceNumber ?? s.controlNumber ?? "—"}`}
          amount={<span className="font-semibold tabular-nums">{money(s.totalCents)}</span>}
        />
      )}
      renderRow={(s) => (
        <>
          <EntryIcon icon={ReceiptTextIcon} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{nameOf(s)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {formatDate(s.createdAt)} · Nº {s.invoiceNumber ?? s.controlNumber ?? "—"}
            </span>
          </span>
          <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">IVA {money(s.taxCents)}</span>
          <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums">{money(s.totalCents)}</span>
        </>
      )}
      renderDetail={(s) => (
        <>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-lg font-semibold leading-tight">{nameOf(s)}</h3>
            <p className="text-sm text-muted-foreground">RIF/Cédula {s.customerRif ?? "—"}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Fecha">{formatDate(s.createdAt)}</Field>
            <Field label="Nº control">{s.controlNumber ?? "—"}</Field>
            <Field label="Nº factura">{s.invoiceNumber ?? "—"}</Field>
            <Field label="Base imponible">{money(s.baseImponibleCents)}</Field>
            <Field label="IVA">{money(s.taxCents)}</Field>
            <Field label="Total" wide>
              <span className="text-lg font-semibold">{money(s.totalCents)}</span>
            </Field>
          </dl>
        </>
      )}
    />
  );
}

export function PurchasesBookList({
  purchases,
  referenceCurrency,
  totals,
  empty,
}: {
  purchases: PurchaseEntry[];
  referenceCurrency: ReferenceCurrency;
  totals: { base: number; tax: number; retained: number; total: number };
  empty: ReactNode;
}) {
  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);
  const supplierOf = (p: PurchaseEntry) => p.supplier?.name ?? p.manualSupplierName ?? "—";
  return (
    <MasterDetail
      items={purchases}
      label="Libro de Compras"
      empty={empty}
      footer={
        <TotalsStrip
          items={[
            { label: "Base", value: money(totals.base) },
            { label: "IVA", value: money(totals.tax) },
            { label: "Retenido", value: money(totals.retained) },
            { label: "Total", value: money(totals.total) },
          ]}
        />
      }
      renderRowMobile={(p) => (
        <MobileRow
          title={supplierOf(p)}
          meta={`${formatDate(p.createdAt)} · Nº ${p.supplierInvoiceNo ?? p.controlNumber ?? "—"}`}
          amount={<span className="font-semibold tabular-nums">{money(p.totalCents)}</span>}
        />
      )}
      renderRow={(p) => (
        <>
          <EntryIcon icon={PackageIcon} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{supplierOf(p)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {formatDate(p.createdAt)} · Nº {p.supplierInvoiceNo ?? p.controlNumber ?? "—"}
            </span>
          </span>
          <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">IVA {money(p.taxCents)}</span>
          <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums">{money(p.totalCents)}</span>
        </>
      )}
      renderDetail={(p) => (
        <>
          <div className="flex flex-col gap-0.5">
            <h3 className="text-lg font-semibold leading-tight">{supplierOf(p)}</h3>
            <p className="text-sm text-muted-foreground">RIF {p.supplier?.rif ?? "—"}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Fecha">{formatDate(p.createdAt)}</Field>
            <Field label="Nº control">{p.controlNumber ?? "—"}</Field>
            <Field label="Factura proveedor">{p.supplierInvoiceNo ?? "—"}</Field>
            <Field label="Base imponible">{money(p.baseImponibleCents)}</Field>
            <Field label="IVA">{money(p.taxCents)}</Field>
            <Field label="IVA retenido">{money(p.ivaRetainedCents)}</Field>
            <Field label="Total" wide>
              <span className="text-lg font-semibold">{money(p.totalCents)}</span>
            </Field>
          </dl>
        </>
      )}
    />
  );
}
