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
import { useSourceAccountsReload } from "@/components/purchases/AccountSelect";
import { MethodAndAccount } from "@/components/payments/MethodAndAccount";
import { accountChoiceMessage } from "@/lib/payment-method-accounts";
import type { PaymentMethod } from "@prisma/client";
import { InsufficientFundsNotice, type FundsError } from "@/components/accounts/InsufficientFundsNotice";
import { money } from "@/lib/money-display";
import { dualAmount, isLocalMethod, type MoneyCtx } from "@/lib/money-primary";

const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Compras → Órdenes de pago (preview): cuentas por pagar con casillas para agrupar facturas en una
// orden de pago y pagarla de una vez; cada factura admite abonos parciales desde ⋯.
export function PaymentOrdersPanel({ orders, ctx }: { orders: PaymentOrderRow[]; ctx: MoneyCtx }) {
  const currency = ctx.referenceCurrency;
  const dual = (c: number, local: boolean) => {
    const d = dualAmount(c, ctx, local);
    return (
      <>
        {d.primary}
        {d.secondary && <small className="block text-right text-xs font-normal text-muted-foreground">{d.secondary}</small>}
      </>
    );
  };
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
                        Compra Nº {o.controlNumber ?? "—"} · {d.getDate()} {SHORT[d.getMonth()]} · {o.paidCents > 0 ? `Parcial · abonado ${dualAmount(o.paidCents, ctx, o.primaryLocal).primary}` : "A crédito"}
                        {o.ageDays > 60 && <span className="font-bold text-destructive"> · hace {o.ageDays} días</span>}
                      </small>
                    </span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    <b className="tabular-nums">{dual(o.remainingCents, o.primaryLocal)}</b>
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
      {paying && <PayDialog order={paying} ctx={ctx} onClose={() => setPaying(null)} />}
      {orderOpen && (
        <OrderSheet
          orders={chosen}
          ctx={ctx}
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
function OrderSheet({ orders, ctx, onClose, onPaid }: { orders: PaymentOrderRow[]; ctx: MoneyCtx; onClose: () => void; onPaid: () => void }) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  const [ref, setRef] = useState("");
  const [accountId, setAccountId] = useState("");
  const { accounts, reload } = useSourceAccountsReload();
  const [funds, setFunds] = useState<FundsError | null>(null);
  const [pending, start] = useTransition();
  const total = orders.reduce((n, o) => n + o.remainingCents, 0);
  const localMethod = isLocalMethod(method, false, ctx);
  const amt = (c: number) => {
    const d = dualAmount(c, ctx, localMethod);
    return (
      <>
        {d.primary}
        {d.secondary && <small className="block text-right text-xs font-normal text-muted-foreground">{d.secondary}</small>}
      </>
    );
  };
  const [pickError, setPickError] = useState<string | null>(null);
  function pay() {
    setFunds(null);
    const missing = accountChoiceMessage(method, accounts, accountId);
    setPickError(missing);
    if (missing) return;
    start(async () => {
      let ok = 0;
      let stopped = false;
      for (const o of orders) {
        const r = await registerPurchasePayment(o.id, method, o.remainingCents, ref, accountId || undefined);
        if (r.success) ok++;
        else if (r.code === "INSUFFICIENT_FUNDS") {
          // Se detiene: las facturas que faltan se pagan después de agregar fondos.
          setFunds(r);
          stopped = true;
          break;
        } else toast.error(`${o.supplierName}: ${r.error}`);
      }
      if (ok) toast.success(`Orden pagada · ${ok} factura(s)`);
      router.refresh();
      if (!stopped) onPaid();
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
              <b className="tabular-nums">{amt(o.remainingCents)}</b>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2.5 py-2.5">
            <b>Total de la orden</b>
            <b className="tabular-nums">{amt(total)}</b>
          </div>
        </div>
        <Field label="Método de pago">
          <MethodAndAccount method={method} onMethod={setMethod} accounts={accounts} accountId={accountId} onAccount={setAccountId} />
        </Field>
        <Field label="Referencia (opcional)">
          <input className={FIELD_CONTROL} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        {pickError && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {pickError}
          </p>
        )}
        {funds && (
          <InsufficientFundsNotice
            failure={funds}
            accounts={accounts}
            onFunded={() => {
              setFunds(null);
              reload();
            }}
          />
        )}
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
export function PayDialog({ order, ctx, onClose }: { order: PaymentOrderRow; ctx: MoneyCtx; onClose: () => void }) {
  const router = useRouter();
  const [method, setMethod] = useState<PaymentMethod>("TRANSFER");
  // Con un método en bolívares el monto se escribe en bolívares; con divisa, en la moneda de referencia.
  const local = isLocalMethod(method, false, ctx) && ctx.rate != null;
  const fullText = (loc: boolean) => (loc && ctx.rate != null ? ((order.remainingCents * ctx.rate) / 100).toFixed(2) : (order.remainingCents / 100).toFixed(2));
  const [amount, setAmount] = useState(fullText(local));
  const [ref, setRef] = useState("");
  const [accountId, setAccountId] = useState("");
  const { accounts, reload } = useSourceAccountsReload();
  const [funds, setFunds] = useState<FundsError | null>(null);
  const [pending, start] = useTransition();
  const typed = parseFloat(amount.replace(",", ".")) || 0;
  // Si lo escrito en Bs equivale al saldo completo se usa el saldo exacto (evita un centavo de diferencia por redondeo).
  const cents =
    local && ctx.rate != null
      ? Math.round(typed * 100) === Math.round(order.remainingCents * ctx.rate)
        ? order.remainingCents
        : Math.round((typed * 100) / ctx.rate)
      : Math.round(typed * 100);
  const left = order.remainingCents - cents;
  const d = (c: number) => dualAmount(c, ctx, local);
  const both = (c: number) => {
    const x = d(c);
    return x.secondary ? `${x.primary} (${x.secondary})` : x.primary;
  };
  function changeMethod(m: PaymentMethod) {
    setMethod(m);
    const nextLocal = isLocalMethod(m, false, ctx) && ctx.rate != null;
    if (nextLocal !== local) setAmount(fullText(nextLocal));
  }

  const [pickError, setPickError] = useState<string | null>(null);
  function save() {
    setFunds(null);
    const missing = accountChoiceMessage(method, accounts, accountId);
    setPickError(missing);
    if (missing) return;
    start(async () => {
      const r = await registerPurchasePayment(order.id, method, cents, ref, accountId || undefined);
      if (r.success) {
        toast.success("Pago registrado");
        onClose();
        router.refresh();
      } else if (r.code === "INSUFFICIENT_FUNDS") setFunds(r);
      else toast.error(r.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago a {order.supplierName}</DialogTitle>
          <DialogDescription>
            Compra Nº {order.controlNumber ?? "—"} · saldo {both(order.remainingCents)}. Puedes pagar una parte y el resto después.
          </DialogDescription>
        </DialogHeader>
        <Field label="Método">
          <MethodAndAccount method={method} onMethod={changeMethod} accounts={accounts} accountId={accountId} onAccount={setAccountId} />
        </Field>
        <Field label={`Monto a pagar (${local ? ctx.localCurrencyCode : ctx.referenceCurrency})`}>
          <input className={FIELD_CONTROL} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Referencia (opcional)">
          <input className={FIELD_CONTROL} value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
        {pickError && (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {pickError}
          </p>
        )}
        {funds && (
          <InsufficientFundsNotice
            failure={funds}
            accounts={accounts}
            onFunded={() => {
              setFunds(null);
              reload();
            }}
          />
        )}
        {cents > 0 && cents <= order.remainingCents && (
          <p className="mt-2 text-sm text-muted-foreground">{left === 0 ? "Con este pago la compra queda pagada." : `Quedará un saldo de ${both(left)}.`}</p>
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
