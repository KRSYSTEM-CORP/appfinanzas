import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { QuoteHistoryTable } from "@/components/quotes/QuoteHistoryTable";
import { listQuotes } from "@/lib/actions/quotes";
import { getExchangeRateInfo } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function QuoteHistoryPage() {
  const [quotes, { referenceCurrency }] = await Promise.all([listQuotes(), getExchangeRateInfo()]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Seguimiento de presupuestos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Los presupuestos pendientes más antiguos aparecen primero — márcalos como aprobados o
            perdidos cuando sepas el resultado, uno por uno o en bloque.
          </p>
        </div>
        <Link href="/quotes" className="text-sm text-primary underline underline-offset-2">
          + Nuevo presupuesto
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <QuoteHistoryTable quotes={quotes} referenceCurrency={referenceCurrency} />
        </CardContent>
      </Card>
    </div>
  );
}
