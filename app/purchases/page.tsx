import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";
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
import { formatDate, PAYMENT_METHOD_LABELS, PURCHASE_PAYMENT_STATUS_LABELS } from "@/lib/format";
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
          <div className="overflow-x-auto">
            <Table className="table-cards">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Nº control</TableHead>
                  <TableHead>Factura proveedor</TableHead>
                  <TableHead className="text-right">Base imponible</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((p) => (
                  <TableRow key={p.id} className={p.voided ? "opacity-50" : undefined}>
                    <TableCell data-label="Fecha">
                      {formatDate(p.createdAt)}
                      {p.voided && (
                        <span className="block">
                          <Badge variant="destructive">Anulada</Badge>
                        </span>
                      )}
                    </TableCell>
                    <TableCell data-label="Proveedor">{p.supplier?.name ?? p.manualSupplierName ?? "—"}</TableCell>
                    <TableCell data-label="Nº control">{p.controlNumber ?? "—"}</TableCell>
                    <TableCell data-label="Factura proveedor">{p.supplierInvoiceNo ?? "—"}</TableCell>
                    <TableCell data-label="Base imponible" className="text-right">
                      {formatCurrencyCents(referenceCurrency, p.baseImponibleCents)}
                    </TableCell>
                    <TableCell data-label="IVA" className="text-right">
                      {formatCurrencyCents(referenceCurrency, p.taxCents)}
                      {p.ivaRetainedCents > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          Retenido: {formatCurrencyCents(referenceCurrency, p.ivaRetainedCents)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell data-label="Total" className="text-right font-medium">
                      {formatCurrencyCents(referenceCurrency, p.totalCents)}
                    </TableCell>
                    <TableCell data-label="Estado" className="text-center">
                      <Badge variant={p.paymentStatus === "PAID" ? "success" : "destructive"}>
                        {PURCHASE_PAYMENT_STATUS_LABELS[p.paymentStatus]}
                      </Badge>
                      {p.payments.length > 0 && (
                        <span className="block text-xs text-muted-foreground mt-1">
                          {p.payments.map((pay) => PAYMENT_METHOD_LABELS[pay.paymentMethod]).join(", ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell data-label="Acciones" className="text-right">
                      <PurchaseActions purchaseId={p.id} paymentStatus={p.paymentStatus} voided={p.voided} />
                    </TableCell>
                  </TableRow>
                ))}
                {purchases.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="p-0">
                      <div className="flex flex-col items-center gap-3 py-14 text-center">
                        <div className="flex items-center justify-center size-11 rounded-full bg-muted text-muted-foreground">
                          <ShoppingBagIcon className="size-5" />
                        </div>
                        <p className="text-sm font-medium">Aún no tienes compras</p>
                        <p className="text-sm text-muted-foreground max-w-xs">
                          Registra tu primera compra a un proveedor para aumentar el stock.
                        </p>
                      </div>
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
