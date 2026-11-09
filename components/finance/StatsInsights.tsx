import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCents } from "@/lib/currencies";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { PaymentMethod, ReferenceCurrency } from "@prisma/client";
import type { PaymentMixRow, PurchasedProductRow, RotationRow } from "@/lib/actions/reports";

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

// Distribución de ventas, productos más comprados y rotación del periodo.
export function StatsInsights({
  mix,
  purchased,
  rotation,
  referenceCurrency,
}: {
  mix: PaymentMixRow[];
  purchased: PurchasedProductRow[];
  rotation: RotationRow[];
  referenceCurrency: ReferenceCurrency;
}) {
  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);
  const total = mix.reduce((a, r) => a + r.totalCents, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Distribución de ventas</CardTitle>
        </CardHeader>
        <CardContent>
          {mix.length === 0 ? (
            <Empty>Sin cobros en este período.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {mix.map((r) => {
                const pct = total > 0 ? Math.round((r.totalCents / total) * 100) : 0;
                return (
                  <li key={r.method} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{PAYMENT_METHOD_LABELS[r.method as PaymentMethod] ?? r.method}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {money(r.totalCents)} · {pct} %
                      </span>
                    </div>
                    <div
                      className="h-1.5 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-label={`${pct} % de las ventas`}
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Productos más comprados</CardTitle>
        </CardHeader>
        <CardContent>
          {purchased.length === 0 ? (
            <Empty>Sin compras en este período.</Empty>
          ) : (
            <ol className="flex flex-col divide-y text-sm">
              {purchased.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-2 py-1.5">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {p.quantity} u. · {money(p.totalCents)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rotación de inventario</CardTitle>
        </CardHeader>
        <CardContent>
          {rotation.length === 0 ? (
            <Empty>Sin ventas de productos con control de stock.</Empty>
          ) : (
            <>
              <ol className="flex flex-col divide-y text-sm">
                {rotation.map((r) => (
                  <li key={r.name} className="flex items-baseline justify-between gap-2 py-1.5">
                    <span className="truncate">{r.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {r.sold} vendidas · stock {r.stock} · <b className="text-foreground">{r.turns}×</b>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                Rotación = unidades vendidas ÷ stock actual. Más alto, más rápido se agota.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
