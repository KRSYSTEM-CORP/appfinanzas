"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrencyCents } from "@/lib/currencies";
import { registerPurchasePayment, type CostComparisonRow, type PaymentOrderRow } from "@/lib/actions/purchases";

const METHODS: [string, string][] = [
  ["TRANSFER", "Transferencia"], ["CASH", "Efectivo"], ["POS", "Punto de venta"], ["CARD", "Pago móvil / tarjeta"],
  ["ZELLE", "Zelle"], ["BINANCE", "Binance"], ["PAYPAL", "PayPal"], ["OTHER", "Otro"],
];

function ageBucket(days: number) {
  return days <= 30 ? "0-30 días" : days <= 60 ? "31-60 días" : "Más de 60 días";
}

export function PaymentOrdersPanel({
  orders,
  comparison,
  currency,
}: {
  orders: PaymentOrderRow[];
  comparison: CostComparisonRow[];
  currency: string;
}) {
  const [tab, setTab] = useState<"orders" | "compare">("orders");
  const [paying, setPaying] = useState<PaymentOrderRow | null>(null);
  const m = (c: number) => formatCurrencyCents(currency, c);

  const total = orders.reduce((n, o) => n + o.remainingCents, 0);
  const buckets = { "0-30 días": 0, "31-60 días": 0, "Más de 60 días": 0 } as Record<string, number>;
  for (const o of orders) buckets[ageBucket(o.ageDays)] += o.remainingCents;

  const bySupplier = new Map<string, PaymentOrderRow[]>();
  for (const o of orders) bySupplier.set(o.supplierName, [...(bySupplier.get(o.supplierName) ?? []), o]);

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Vista"
        value={tab}
        onChange={setTab}
        options={[
          { value: "orders", label: "Órdenes de pago" },
          { value: "compare", label: "Comparativa de costos" },
        ]}
      />

      {tab === "orders" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Por pagar" value={m(total)} />
            {Object.entries(buckets).map(([k, v]) => (
              <Kpi key={k} label={k} value={m(v)} warn={k === "Más de 60 días" && v > 0} />
            ))}
          </div>
          {orders.length === 0 ? (
            <p className="rounded-[19px] bg-card p-4 text-sm text-muted-foreground shadow-(--shadow-card)">
              No debes nada a tus proveedores. Las compras a crédito aparecen aquí hasta que las pagues.
            </p>
          ) : (
            [...bySupplier.entries()].map(([supplier, list]) => (
              <section key={supplier} className="flex flex-col gap-2 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-bold">{supplier}</h2>
                  <span className="font-bold tabular-nums">{m(list.reduce((n, o) => n + o.remainingCents, 0))}</span>
                </div>
                <ul className="flex flex-col divide-y">
                  {list.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">Compra Nº {o.controlNumber ?? "—"}</span>
                        <span className={`ml-2 text-xs ${o.ageDays > 60 ? "font-bold text-destructive" : "text-muted-foreground"}`}>hace {o.ageDays} días</span>
                        {o.paidCents > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            Abonado {m(o.paidCents)} de {m(o.owedCents)}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums font-bold">{m(o.remainingCents)}</span>
                      <Button size="sm" onClick={() => setPaying(o)}>
                        Pagar
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      {tab === "compare" && (
        <>
          <p className="text-sm text-muted-foreground">
            Lo último que pagaste a cada proveedor por el mismo producto. Solo aparecen productos que has comprado a dos o más proveedores.
          </p>
          {comparison.length === 0 ? (
            <p className="rounded-[19px] bg-card p-4 text-sm text-muted-foreground shadow-(--shadow-card)">
              Aún no hay productos comprados a más de un proveedor.
            </p>
          ) : (
            comparison.map((r) => (
              <section key={r.productName} className="flex flex-col gap-2 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-bold">{r.productName}</h2>
                  {r.savingPct > 0 && <span className="rounded-full bg-success/14 px-2.5 py-0.5 text-xs font-bold text-success">Ahorras hasta {r.savingPct} %</span>}
                </div>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {r.offers.map((o, i) => (
                    <li key={o.supplier} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate">
                        {o.supplier}
                        {i === 0 && <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold text-primary">Más barato</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{new Date(o.date).toLocaleDateString("es-VE")}</span>
                      <span className="w-24 text-right font-bold tabular-nums">{m(o.lastCostCents)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}

      {paying && <PayDialog order={paying} currency={currency} onClose={() => setPaying(null)} />}
    </div>
  );
}

function Kpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${warn ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

// «Fraccionar pago»: se puede abonar una parte; cuando se cubre todo, la compra queda pagada.
function PayDialog({ order, currency, onClose }: { order: PaymentOrderRow; currency: string; onClose: () => void }) {
  const router = useRouter();
  const [method, setMethod] = useState("TRANSFER");
  const [amount, setAmount] = useState((order.remainingCents / 100).toFixed(2));
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cents = Math.round((parseFloat(amount.replace(",", ".")) || 0) * 100);
  const left = order.remainingCents - cents;

  function save() {
    setError(null);
    start(async () => {
      const r = await registerPurchasePayment(order.id, method, cents, ref);
      if (r.success) {
        onClose();
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pagar a {order.supplierName}</DialogTitle>
          <DialogDescription>
            Compra Nº {order.controlNumber ?? "—"} · saldo {formatCurrencyCents(currency, order.remainingCents)}. Puedes pagar una parte y el resto después.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-method">Método</Label>
            <select id="po-method" value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-xl border bg-background px-2 text-sm">
              {METHODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-amount">Monto a pagar</Label>
            <Input id="po-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="po-ref">Referencia (opcional)</Label>
            <Input id="po-ref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          {cents > 0 && cents <= order.remainingCents && (
            <p className="text-sm text-muted-foreground">
              {left === 0 ? "Con este pago la compra queda pagada." : `Quedará un saldo de ${formatCurrencyCents(currency, left)}.`}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || cents <= 0 || cents > order.remainingCents} onClick={save}>
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
