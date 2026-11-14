"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, FileTextIcon, TrendingDownIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { RowMenu } from "@/components/shared/RowMenu";
import { SectionCard } from "@/components/shared/SectionCard";
import { registerPurchasePayment, type PaymentOrderRow } from "@/lib/actions/purchases";
import { money } from "@/lib/money-display";

const METHODS: [string, string][] = [
  ["TRANSFER", "Transferencia"], ["CASH", "Efectivo"], ["POS", "Punto de venta"], ["CARD", "Pago Móvil"],
  ["ZELLE", "Zelle"], ["BINANCE", "Binance"], ["PAYPAL", "PayPal"], ["OTHER", "Otro"],
];
const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Compras → Órdenes de pago (preview): cuentas por pagar con casillas para agrupar facturas en una
// orden de pago y pagarla de una vez; cada factura admite abonos parciales desde ⋯.
export function PaymentOrdersPanel({ orders, currency }: { orders: PaymentOrderRow[]; currency: string }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState<PaymentOrderRow | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const m = (c: number, d: 0 | 2 = 2) => money(currency, c, d);
  const total = orders.reduce((n, o) => n + o.remainingCents, 0);
  const suppliers = new Set(orders.map((o) => o.supplierName)).size;
  const chosen = orders.filter((o) => sel.has(o.id));
  const chosenTotal = chosen.reduce((n, o) => n + o.remainingCents, 0);
  const late = orders.filter((o) => o.ageDays > 60);

  function toggle(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  return (
    <>
      <KpiGrid>
        <Kpi tone="warn" icon={<TrendingDownIcon />} label="Por pagar" value={m(total, 0)} hint={`${suppliers} proveedores`} />
        <Kpi tone="info" icon={<BanknoteIcon />} label="Seleccionado" value={m(chosenTotal, 0)} hint={`${chosen.length} facturas marcadas`} />
        <Kpi tone={late.length ? "bad" : "ok"} icon={<FileTextIcon />} label="Más de 60 días" value={m(late.reduce((n, o) => n + o.remainingCents, 0), 0)} hint={`${late.length} facturas con atraso`} />
      </KpiGrid>
      <SectionCard title="Cuentas por pagar" subtitle="Compras a crédito con saldo, de la más antigua a la más reciente · marca facturas para agrupar en una orden de pago">
        {orders.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No debes nada a tus proveedores. Las compras a crédito aparecen aquí hasta que las pagues.</p>
        ) : (
          <>
            {orders.map((o) => {
              const d = new Date(o.createdAt);
              return (
                <div key={o.id} className="flex items-center justify-between gap-2.5 border-b py-2.5">
                  <label className="flex min-w-0 cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={sel.has(o.id)} onChange={() => toggle(o.id)} className="size-[22px] flex-none rounded-md accent-(--primary)" />
                    <span className="min-w-0">
                      <b className="block">{o.supplierName}</b>
                      <small className="block text-xs text-muted-foreground">
                        Compra Nº {o.controlNumber ?? "—"} · {d.getDate()} {SHORT[d.getMonth()]} · {o.paidCents > 0 ? `Parcial · abonado ${m(o.paidCents)}` : "A crédito"}
                        {o.ageDays > 60 && <span className="font-bold text-destructive"> · hace {o.ageDays} días</span>}
                      </small>
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <b className="tabular-nums">{m(o.remainingCents)}</b>
                    <RowMenu items={[{ label: "Registrar abono", onSelect: () => setPaying(o) }]} />
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3">
              <b>Seleccionado: {m(chosenTotal)}</b>
              <Button disabled={chosen.length === 0} onClick={() => setOrderOpen(true)}>
                <BanknoteIcon aria-hidden /> Crear orden de pago
              </Button>
            </div>
          </>
        )}
      </SectionCard>
      {paying && <PayDialog order={paying} currency={currency} onClose={() => setPaying(null)} />}
      {orderOpen && (
        <OrderSheet
          orders={chosen}
          currency={currency}
          onClose={() => setOrderOpen(false)}
          onPaid={() => {
            setOrderOpen(false);
            setSel(new Set());
          }}
        />
      )}
    </>
  );
}

// Orden de pago: agrupa las facturas marcadas y las paga todas con un mismo método y referencia.
function OrderSheet({ orders, currency, onClose, onPaid }: { orders: PaymentOrderRow[]; currency: string; onClose: () => void; onPaid: () => void }) {
  const router = useRouter();
  const [method, setMethod] = useState("TRANSFER");
  const [ref, setRef] = useState("");
  const [pending, start] = useTransition();
  const total = orders.reduce((n, o) => n + o.remainingCents, 0);
  function pay() {
    start(async () => {
      let ok = 0;
      for (const o of orders) {
        const r = await registerPurchasePayment(o.id, method, o.remainingCents, ref);
        if (r.success) ok++;
        else toast.error(`${o.supplierName}: ${r.error}`);
      }
      if (ok) toast.success(`Orden pagada · ${ok} factura(s) por ${money(currency, total)}`);
      router.refresh();
      onPaid();
    });
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Orden de pago</DialogTitle>
          <DialogDescription>
            {orders.length} facturas de {new Set(orders.map((o) => o.supplierName)).size} proveedores
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2">
          {orders.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2.5 border-b py-2.5">
              <div className="min-w-0">
                <b>{o.supplierName}</b>
                <small className="block text-xs text-muted-foreground">Compra Nº {o.controlNumber ?? "—"}</small>
              </div>
              <b className="tabular-nums">{money(currency, o.remainingCents)}</b>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2.5 py-2.5">
            <b>Total de la orden</b>
            <b className="tabular-nums">{money(currency, total)}</b>
          </div>
        </div>
        <Field label="Método de pago">
          <select className={FIELD_CONTROL} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Referencia (opcional)">
          <input className={FIELD_CONTROL} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        <SheetActions>
          <Button disabled={pending} onClick={pay}>
            Marcar pagada
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

// «Fraccionar pago»: se puede abonar una parte; cuando se cubre todo, la compra queda pagada.
export function PayDialog({ order, currency, onClose }: { order: PaymentOrderRow; currency: string; onClose: () => void }) {
  const router = useRouter();
  const [method, setMethod] = useState("TRANSFER");
  const [amount, setAmount] = useState((order.remainingCents / 100).toFixed(2));
  const [ref, setRef] = useState("");
  const [pending, start] = useTransition();
  const cents = Math.round((parseFloat(amount.replace(",", ".")) || 0) * 100);
  const left = order.remainingCents - cents;

  function save() {
    start(async () => {
      const r = await registerPurchasePayment(order.id, method, cents, ref);
      if (r.success) {
        toast.success("Pago registrado");
        onClose();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago a {order.supplierName}</DialogTitle>
          <DialogDescription>
            Compra Nº {order.controlNumber ?? "—"} · saldo {money(currency, order.remainingCents)}. Puedes pagar una parte y el resto después.
          </DialogDescription>
        </DialogHeader>
        <Field label="Método">
          <select className={FIELD_CONTROL} value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Monto a pagar">
          <input className={FIELD_CONTROL} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Referencia (opcional)">
          <input className={FIELD_CONTROL} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        {cents > 0 && cents <= order.remainingCents && (
          <p className="mt-2 text-sm text-muted-foreground">{left === 0 ? "Con este pago la compra queda pagada." : `Quedará un saldo de ${money(currency, left)}.`}</p>
        )}
        <SheetActions>
          <Button disabled={pending || cents <= 0 || cents > order.remainingCents} onClick={save}>
            Registrar pago
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}
