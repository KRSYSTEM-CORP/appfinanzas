import { BookOpenIcon, PackageIcon, PercentIcon, ReceiptTextIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatCard } from "@/components/reports/StatCard";
import { PurchasesBookList, SalesBookList } from "@/components/finance/TaxBookLists";
import { TaxBookExportButton } from "@/components/finance/TaxBookExportButton";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { formatCurrencyCents } from "@/lib/currencies";
import { getSalesTaxBook, getPurchasesTaxBook } from "@/lib/actions/tax-book";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { parseDateRangeSelection } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function TaxBookPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string }>;
}) {
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });

  const [sales, purchases, { referenceCurrency }] = await Promise.all([
    getSalesTaxBook(range),
    getPurchasesTaxBook(range),
    getExchangeRateInfo(),
  ]);

  const salesTotals = sales.reduce(
    (acc, s) => ({
      base: acc.base + s.baseImponibleCents,
      tax: acc.tax + s.taxCents,
      total: acc.total + s.totalCents,
    }),
    { base: 0, tax: 0, total: 0 }
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

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Libro de Contabilidad</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Formato de referencia para tu declaración de IVA ante el SENIAT — verifica los montos
            con tu contador antes de declarar.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <DateRangeSwitcher selection={range} />
          <TaxBookExportButton
            sales={sales}
            purchases={purchases}
            rangeLabel={
              range.kind === "preset" ? range.preset : `meses-${range.year}-${range.months.join("-")}`
            }
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card shadow-xs stat-grid divide-y md:divide-y-0 md:divide-x grid grid-cols-1 md:grid-cols-4 [&>*]:p-4">
        <StatCard
          label="Ventas: base imponible"
          accent="primary"
          icon={ReceiptTextIcon}
          value={formatCurrencyCents(referenceCurrency, salesTotals.base)}
        />
        <StatCard
          label="Ventas: IVA"
          accent="violet"
          icon={PercentIcon}
          value={formatCurrencyCents(referenceCurrency, salesTotals.tax)}
        />
        <StatCard
          label="Compras: base imponible"
          accent="success"
          icon={PackageIcon}
          value={formatCurrencyCents(referenceCurrency, purchasesTotals.base)}
        />
        <StatCard
          label="Compras: IVA"
          accent="warning"
          icon={PercentIcon}
          value={formatCurrencyCents(referenceCurrency, purchasesTotals.tax)}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Libro de Ventas</h2>
        <SalesBookList
          sales={sales}
          referenceCurrency={referenceCurrency}
          totals={salesTotals}
          empty={<EmptyState icon={BookOpenIcon} title="Sin ventas en este período." className="py-10" />}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Libro de Compras</h2>
        <PurchasesBookList
          purchases={purchases}
          referenceCurrency={referenceCurrency}
          totals={purchasesTotals}
          empty={<EmptyState icon={BookOpenIcon} title="Sin compras en este período." className="py-10" />}
        />
      </section>
    </div>
  );
}
