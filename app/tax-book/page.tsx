import { requireAccountingPlan } from "@/lib/session";
import { BookOpenIcon, PackageIcon, PercentIcon, ReceiptTextIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { PurchasesBookList, SalesBookList } from "@/components/finance/TaxBookLists";
import { TaxBookExportButton } from "@/components/finance/TaxBookExportButton";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { AdminShell } from "@/components/accounting/AdminShell";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { Note, SectionCard } from "@/components/shared/SectionCard";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { money } from "@/lib/money-display";
import { selectionLabel } from "@/lib/period-label";
import { getSalesTaxBook, getPurchasesTaxBook, getCreditNotesTaxBook, getDebitNotesTaxBook } from "@/lib/actions/tax-book";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { parseDateRangeSelection, todayDateString } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function TaxBookPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string; libro?: string }>;
}) {
  await requireAccountingPlan();
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });

  const [sales, purchases, creditNotes, debitNotes, { referenceCurrency }] = await Promise.all([
    getSalesTaxBook(range),
    getPurchasesTaxBook(range),
    getCreditNotesTaxBook(range),
    getDebitNotesTaxBook(range),
    getExchangeRateInfo(),
  ]);

  const salesTotals = sales.reduce(
    (acc, s) => ({
      base: acc.base + s.baseImponibleCents,
      tax: acc.tax + s.taxCents,
      total: acc.total + s.totalCents,
    }),
    // Notas de débito add to the period's sales; notas de crédito subtract.
    [...debitNotes.map((n) => ({ sign: 1, n })), ...creditNotes.map((n) => ({ sign: -1, n }))].reduce(
      (acc, { sign, n }) => ({
        base: acc.base + sign * n.baseImponibleCents,
        tax: acc.tax + sign * n.taxCents,
        total: acc.total + sign * n.totalCents,
      }),
      { base: 0, tax: 0, total: 0 }
    )
  );
  const purchasesTotals = purchases.reduce(
    (acc, p) => ({
      base: acc.base + p.baseImponibleCents,
      tax: acc.tax + p.taxCents,
      retained: acc.retained + p.ivaRetainedCents,
      total: acc.total + p.totalCents,
    }),
    { base: 0, tax: 0, retained: 0, total: 0 }
  );

  const libro = params.libro === "compras" ? "compras" : "ventas";
  const m = (c: number) => money(referenceCurrency, c);
  const label = selectionLabel(range, todayDateString());
  const fiscalSales = sales.filter((x) => x.taxCents > 0).length;

  return (
    <AdminShell group="conta" sub={libro === "ventas" ? "lventas" : "lcompras"}>
      {libro === "ventas" ? (
        <KpiGrid>
          <Kpi tone="info" icon={<ReceiptTextIcon />} label="Ventas del libro" value={m(salesTotals.total)} hint={`${sales.length} documentos vigentes`} />
          <Kpi tone="ok" icon={<BookOpenIcon />} label="Base imponible" value={m(salesTotals.base)} hint="Sin IVA" />
          <Kpi tone="warn" icon={<PercentIcon />} label="IVA 16 % (débito)" value={m(salesTotals.tax)} hint={`Solo documentos fiscales · ${fiscalSales}`} />
        </KpiGrid>
      ) : (
        <KpiGrid>
          <Kpi tone="info" icon={<PackageIcon />} label="Compras del libro" value={m(purchasesTotals.total)} hint={`${purchases.length} facturas`} />
          <Kpi tone="ok" icon={<BookOpenIcon />} label="Base imponible" value={m(purchasesTotals.base)} hint="Sin IVA" />
          <Kpi tone="warn" icon={<PercentIcon />} label="IVA 16 % (crédito)" value={m(purchasesTotals.tax)} hint={`IVA retenido ${m(purchasesTotals.retained)}`} />
        </KpiGrid>
      )}
      <PeriodBar
        label={label}
        end={
          <TaxBookExportButton
            sales={sales}
            purchases={purchases}
            creditNotes={creditNotes}
            debitNotes={debitNotes}
            rangeLabel={
              range.kind === "preset"
                ? range.preset
                : range.kind === "range"
                  ? `rango-${range.from}-a-${range.to}`
                  : `meses-${range.year}-${range.months.join("-")}`
            }
          />
        }
      >
        <DateRangeSwitcher selection={range} extraParams={{ libro }} />
      </PeriodBar>
      {libro === "ventas" ? (
        <SectionCard title="Libro de ventas" subtitle={`${label} · formato de referencia para tu declaración de IVA ante el SENIAT`}>
          <SalesBookList
            sales={sales}
            referenceCurrency={referenceCurrency}
            totals={salesTotals}
            empty={<EmptyState icon={BookOpenIcon} title="Sin ventas en este período." className="py-10" />}
          />
          <Note>Las notas de entrega no son documentos fiscales: no generan IVA. Una factura se corrige con nota de crédito, no se anula.</Note>
        </SectionCard>
      ) : (
        <SectionCard title="Libro de compras" subtitle={`${label} · solo compras con factura fiscal`}>
          <PurchasesBookList
            purchases={purchases}
            referenceCurrency={referenceCurrency}
            totals={purchasesTotals}
            empty={<EmptyState icon={BookOpenIcon} title="Sin compras en este período." className="py-10" />}
          />
          <Note>Verifica los montos con tu contador antes de declarar.</Note>
        </SectionCard>
      )}
    </AdminShell>
  );
}
