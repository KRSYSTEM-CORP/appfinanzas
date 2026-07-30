import { notFound } from "next/navigation";
import Link from "next/link";
import { CustomerCrmForm } from "@/components/customers/CustomerCrmForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/reports/StatCard";
import { formatCurrencyCents } from "@/lib/currencies";
import { formatDate, PAYMENT_STATUS_LABELS, QUOTE_STATUS_LABELS } from "@/lib/format";
import {
  getCustomer,
  getCustomerStats,
  listSalesForCustomer,
  listQuotesForCustomer,
} from "@/lib/actions/customers";
import { getExchangeRateInfo } from "@/lib/actions/settings";

export const dynamic = "force-dynamic";

export default async function CustomerCrmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  const [stats, sales, quotes, { referenceCurrency }] = await Promise.all([
    getCustomerStats(id),
    listSalesForCustomer(id),
    listQuotesForCustomer(customer.phone),
    getExchangeRateInfo(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {customer.firstName} {customer.lastName}
        </h1>
        <Link href={`/customers/${id}`} className="text-sm text-primary underline underline-offset-2">
          Editar datos generales
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total comprado"
          accent="primary"
          value={formatCurrencyCents(referenceCurrency, stats.totalSpentCents)}
        />
        <StatCard label="Compras" accent="success" value={String(stats.purchaseCount)} />
        <StatCard
          label="Última compra"
          accent="violet"
          value={stats.lastPurchaseAt ? formatDate(stats.lastPurchaseAt) : "—"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Notas y seguimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerCrmForm customer={customer} />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Historial de compras</CardTitle>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no tiene compras.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {sales.map((s) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <div className="flex flex-col">
                        <span>{formatDate(s.createdAt)}</span>
                        {s.voided && (
                          <Badge variant="destructive" className="w-fit mt-1">
                            Anulada
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={s.paymentStatus === "PAID" ? "success" : "destructive"}>
                          {PAYMENT_STATUS_LABELS[s.paymentStatus]}
                        </Badge>
                        <span className="font-medium">{formatCurrencyCents(referenceCurrency, s.totalCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Link href="/reports" className="text-sm text-primary underline underline-offset-2 mt-3 inline-block">
                Ver todas las ventas en Reportes
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Presupuestos</CardTitle>
            </CardHeader>
            <CardContent>
              {quotes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no tiene presupuestos.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {quotes.map((q) => (
                    <div key={q.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                      <span>{formatDate(q.createdAt)}</span>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            q.status === "CONVERTED" ? "success" : q.status === "LOST" ? "destructive" : "outline"
                          }
                        >
                          {QUOTE_STATUS_LABELS[q.status]}
                        </Badge>
                        <span className="font-medium">{formatCurrencyCents(referenceCurrency, q.totalCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
