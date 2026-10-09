import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, CalendarDaysIcon, CircleAlertIcon, CreditCardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatUSD } from "@/lib/format";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BlockedPage() {
  const session = await getSession();
  // A stale-but-signed cookie must be cleared through the Route Handler so
  // the next request does not loop back into this page.
  if (!session) redirect("/api/auth/clear-session");
  if (!session.billingBlocked) redirect("/pos");

  const canManageBilling = session.role === "GERENTE" || session.isSuperAdmin;

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-muted/30 p-4 py-8 sm:p-8">
      <Card className="w-full max-w-2xl overflow-hidden border-destructive/20 shadow-lg shadow-destructive/5">
        <div className="h-1.5 bg-destructive" aria-hidden="true" />
        <CardContent className="flex flex-col gap-6 p-5 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive sm:size-14">
              <CircleAlertIcon className="size-6 sm:size-7" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">Acceso temporalmente pausado</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Suscripción vencida</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                La empresa <span className="font-medium text-foreground">{session.companyName}</span> está bloqueada porque
                venció el pago de mantenimiento de KR POS.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
              <CalendarDaysIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Fecha de vencimiento</p>
                <p className="mt-1 font-medium">
                  {session.nextPaymentDueDate ? formatDate(session.nextPaymentDueDate) : "Pendiente de actualización"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border bg-background p-4">
              <CreditCardIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-xs text-muted-foreground">Monto mensual pendiente</p>
                <p className="mt-1 font-semibold">
                  {session.monthlyFeeUsdCents != null ? formatUSD(session.monthlyFeeUsdCents) : "Consulta las opciones de pago"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-warning/30 bg-warning/5 p-4">
            <p className="text-sm font-medium">¿Cómo recuperar el acceso?</p>
            <ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm leading-6 text-muted-foreground">
              <li>El gerente realiza el pago por Binance (USDT) o Pago Móvil.</li>
              <li>Reporta el pago desde KR POS e indica la referencia.</li>
              <li>KR System verifica el pago y reactiva la cuenta.</li>
            </ol>
          </div>

          {canManageBilling ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" className="min-h-11 w-full sm:w-auto" render={<Link href="/billing#opciones-de-pago" />}>
                Ver métodos y reportar pago <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                El acceso se restablece cuando KR System confirme el pago reportado.
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-muted/60 p-4 text-sm leading-6 text-muted-foreground">
              Pídele al gerente de tu empresa que realice o reporte el pago de la suscripción. Los vendedores no pueden gestionar la facturación.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
