import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCents } from "@/lib/currencies";

type Row = { category: string; revenueCents: number; cogsCents: number };

// Costos y rentabilidad: margen por producto (ventas menos costo de lo vendido).
export function ProductMarginsCard({ rows, currency }: { rows: Row[]; currency: string }) {
  const list = rows
    .filter((r) => r.revenueCents > 0)
    .map((r) => ({ ...r, margin: Math.round(((r.revenueCents - r.cogsCents) / r.revenueCents) * 100) }))
    .sort((a, b) => b.margin - a.margin);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Costos y rentabilidad</CardTitle>
        <p className="text-sm text-muted-foreground">Margen por producto en el período, de mayor a menor</p>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin ventas con costo registrado en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1.5 font-medium">Producto</th>
                  <th className="py-1.5 text-right font-medium">Ventas</th>
                  <th className="py-1.5 text-right font-medium">Costo</th>
                  <th className="py-1.5 text-right font-medium">Margen</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.category} className="border-t">
                    <td className="max-w-[200px] truncate py-2 font-medium">{r.category}</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrencyCents(currency, r.revenueCents)}</td>
                    <td className="py-2 text-right tabular-nums">{formatCurrencyCents(currency, r.cogsCents)}</td>
                    <td className={`py-2 text-right font-bold tabular-nums ${r.margin < 20 ? "text-destructive" : "text-success"}`}>{r.margin} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
