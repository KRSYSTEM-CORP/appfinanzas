import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PurchaseActions } from "@/components/purchases/PurchaseActions";
import { formatCurrencyCents } from "@/lib/currencies";
import { formatDate, PURCHASE_PAYMENT_STATUS_LABELS } from "@/lib/format";
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
        <Button nativeButton={false} render={<Link href="/purchases/new" />}>
          Nueva compra
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Historial de compras</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Nº control</TableHead>
                  <TableHead>Factura proveedor</TableHead>
                  <TableHead className="text-right">Base imponible</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id} className={p.voided ? "opacity-50" : undefined}>
                    <TableCell>
                      {formatDate(p.createdAt)}
                      {p.voided && (
                        <span className="block">
                          <Badge variant="destructive">Anulada</Badge>
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{p.supplier.name}</TableCell>
                    <TableCell>{p.controlNumber ?? "—"}</TableCell>
                    <TableCell>{p.supplierInvoiceNo ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCents(referenceCurrency, p.baseImponibleCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrencyCents(referenceCurrency, p.taxCents)}
                      {p.ivaRetainedCents > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          Retenido: {formatCurrencyCents(referenceCurrency, p.ivaRetainedCents)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrencyCents(referenceCurrency, p.totalCents)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={p.paymentStatus === "PAID" ? "success" : "destructive"}>
                        {PURCHASE_PAYMENT_STATUS_LABELS[p.paymentStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <PurchaseActions purchaseId={p.id} paymentStatus={p.paymentStatus} voided={p.voided} />
                    </TableCell>
                  </TableRow>
                ))}
                {purchases.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      Aún no hay compras registradas.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
