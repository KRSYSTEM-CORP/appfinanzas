import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PurchaseMasterDetail } from "@/components/purchases/PurchaseMasterDetail";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { listRecentPurchases } from "@/lib/actions/purchases";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const [purchases, { referenceCurrency }] = await Promise.all([
    listRecentPurchases(),
    getExchangeRateInfo(),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registra compras a proveedores — cada una aumenta el stock y lleva su propio control de
            cuentas por pagar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" nativeButton={false} render={<Link href="/purchases/import" />}>
            Importar desde Excel
          </Button>
          <Button nativeButton={false} render={<Link href="/purchases/new" />}>
            Nueva compra
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de compras</CardTitle>
        </CardHeader>
        <CardContent>
          <PurchaseMasterDetail purchases={purchases} referenceCurrency={referenceCurrency} />
        </CardContent>
      </Card>
    </div>
  );
}
