import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, ArrowDownIcon, ArrowUpIcon, RotateCcwIcon } from "lucide-react";
import { getProductStockMovements } from "@/lib/actions/products";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const reasonLabels: Record<string, string> = {
  SALE: "Venta",
  SALE_VOID: "Anulación de venta",
  PURCHASE: "Compra recibida",
  PURCHASE_VOID: "Anulación de compra",
  ADJUSTMENT: "Ajuste manual",
  IMPORT: "Importación",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("es-VE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function ProductMovementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getProductStockMovements(id);
  if (!data) notFound();

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="outline" size="icon" nativeButton={false} render={<Link href={`/inventory/${id}`} />} aria-label="Volver al producto">
            <ArrowLeftIcon />
          </Button>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inventario · Historial</p>
            <h1 className="mt-1 text-2xl font-semibold">{data.product.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{data.product.branch.name} · Existencia actual: {data.product.stock.toLocaleString("es-VE")}</p>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos de inventario</CardTitle>
          <p className="text-sm text-muted-foreground">Últimos 100 cambios, con responsable y saldo antes y después.</p>
        </CardHeader>
        <CardContent>
          {data.movements.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="font-medium">Todavía no hay movimientos registrados</p>
              <p className="mt-1 text-sm text-muted-foreground">Los cambios de stock futuros aparecerán aquí.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr><th className="px-3 py-3 font-medium">Fecha</th><th className="px-3 py-3 font-medium">Movimiento</th><th className="px-3 py-3 font-medium">Responsable</th><th className="px-3 py-3 text-right font-medium">Cambio</th><th className="px-3 py-3 text-right font-medium">Antes</th><th className="px-3 py-3 text-right font-medium">Después</th></tr>
                </thead>
                <tbody className="divide-y">
                  {data.movements.map((movement) => {
                    const positive = movement.quantityChange > 0;
                    const Icon = positive ? ArrowUpIcon : movement.reason.includes("VOID") ? RotateCcwIcon : ArrowDownIcon;
                    return (
                      <tr key={movement.id}>
                        <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(movement.createdAt)}</td>
                        <td className="px-3 py-3"><span className="inline-flex items-center gap-2"><Icon className={`size-4 ${positive ? "text-emerald-600" : "text-rose-600"}`} />{reasonLabels[movement.reason] ?? movement.reason}</span></td>
                        <td className="px-3 py-3">{movement.actorName}</td>
                        <td className={`px-3 py-3 text-right font-semibold tabular-nums ${positive ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>{positive ? "+" : ""}{movement.quantityChange.toLocaleString("es-VE")}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{movement.stockBefore.toLocaleString("es-VE")}</td>
                        <td className="px-3 py-3 text-right font-medium tabular-nums">{movement.stockAfter.toLocaleString("es-VE")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
