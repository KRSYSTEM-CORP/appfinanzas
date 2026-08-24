import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteHistoryTable } from "@/components/quotes/QuoteHistoryTable";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { listQuotes } from "@/lib/actions/quotes";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { parseDateRangeSelection, selectionToWindows } from "@/lib/report-types";

export const dynamic = "force-dynamic";

export default async function QuoteHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string }>;
}) {
  const params = await searchParams;
  const range = parseDateRangeSelection(params, { kind: "preset", preset: "month" });

  const [quotes, { referenceCurrency }] = await Promise.all([
    listQuotes(500, selectionToWindows(range)),
    getExchangeRateInfo(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Seguimiento de presupuestos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Los presupuestos más recientes aparecen primero — márcalos como aprobados o perdidos
            cuando sepas el resultado, uno por uno o en bloque.
          </p>
        </div>
        <Link href="/quotes" className="text-sm text-primary underline underline-offset-2">
          + Nuevo presupuesto
        </Link>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle>Presupuestos</CardTitle>
          <DateRangeSwitcher selection={range} />
        </CardHeader>
        <CardContent>
          <QuoteHistoryTable quotes={quotes} referenceCurrency={referenceCurrency} />
        </CardContent>
      </Card>
    </div>
  );
}
