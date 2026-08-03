import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatUSD } from "@/lib/format";
import { formatLocalCurrency } from "@/lib/currencies";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function BlockedPage() {
  const session = await getSession();
  // See app/api/auth/clear-session/route.ts — this is a plain page render,
  // so a stale-but-signed cookie (deleted/suspended user) must be cleared
  // through the Route Handler rather than by redirecting straight to /login.
  if (!session) redirect("/api/auth/clear-session");
  if (!session.billingBlocked) redirect("/pos");

  // The Bs preview only makes sense for VES companies, who typically pay via
  // Pago Móvil at the platform's own Bs/USD rate — everyone else just pays
  // the USD amount directly via Zelle/Binance/PayPal.
  const pendingBs =
    session.localCurrencyCode === "VES" &&
    session.monthlyFeeUsdCents != null &&
    session.billingExchangeRate != null
      ? (session.monthlyFeeUsdCents / 100) * session.billingExchangeRate
      : null;

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-6 py-16">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Acceso bloqueado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            <span className="font-medium">{session.companyName}</span> tiene el mantenimiento de la
            plataforma vencido{" "}
            {session.nextPaymentDueDate && (
              <>desde el {formatDate(session.nextPaymentDueDate)}</>
            )}
            .
          </p>
          {session.monthlyFeeUsdCents != null && (
            <p>
              Monto pendiente: <span className="font-medium">{formatUSD(session.monthlyFeeUsdCents)}</span>
              {pendingBs != null && ` (${formatLocalCurrency(pendingBs, session.localCurrencyCode)})`}
            </p>
          )}
          <p className="text-muted-foreground">
            Reporta tu pago y el super admin lo verificará. El acceso se restablece
            automáticamente en cuanto se apruebe.
          </p>
          <Button render={<Link href="/billing" />}>Ver método de pago y reportar</Button>
        </CardContent>
      </Card>
    </div>
  );
}
