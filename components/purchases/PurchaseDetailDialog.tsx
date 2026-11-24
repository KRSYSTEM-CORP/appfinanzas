"use client";

import type { PaymentMethod } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pill, StatusPill } from "@/components/shared/Pills";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { dualAmount, paymentLineAmount, purchaseStatus, type MoneyCtx } from "@/lib/money-primary";

export type RegisterPurchase = {
  id: string;
  createdAt: string;
  controlNumber: number | null;
  supplierName: string;
  supplierInvoiceNo: string | null;
  concept: string;
  items: {
    name: string;
    quantity: number;
    unitCostCents: number;
    subtotalCents: number;
    baseCents: number;
    taxCents: number;
    taxRatePercent: number;
    taxCategory: string;
    affectsStock: boolean;
  }[];
  fiscal: boolean;
  totalCents: number;
  owedCents: number;
  paidCents: number;
  paymentStatus: "PAID" | "PENDING";
  voided: boolean;
  // Detalle completo
  supplierRif: string | null;
  supplierContact: string | null; // teléfono · correo · dirección
  branchName: string;
  note: string | null;
  baseCents: number;
  taxCents: number;
  ivaRetainedCents: number;
  paidAt: string | null;
  voidedAt: string | null;
  createdByName: string | null;
  voidedByName: string | null;
  // Bolívares primero solo si todos los pagos fueron en bolívares.
  primaryLocal: boolean;
  payments: {
    id: string;
    createdAt: string;
    paymentMethod: PaymentMethod;
    paidInForeignCurrency: boolean;
    amountEurCents: number;
    amountCurrencyCents: number | null;
    currencyCode: string | null;
    exchangeRate: number | null;
    reference: string | null;
    accountLabel: string | null;
  }[];
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const TAX_LABEL: Record<string, string> = { GENERAL: "General", REDUCED: "Reducido", EXEMPT: "Exento" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

function Dual({ cents, ctx, local }: { cents: number; ctx: MoneyCtx; local: boolean }) {
  const d = dualAmount(cents, ctx, local);
  return (
    <span className="tabular-nums">
      {d.primary}
      {d.secondary && <small className="block text-xs font-normal text-muted-foreground">{d.secondary}</small>}
    </span>
  );
}

// «Detalle de la compra»: toda la información de la compra y de sus pagos, con la moneda del método primero.
export function PurchaseDetailDialog({
  purchase: p,
  ctx,
  onClose,
  onVoid,
  onPay,
}: {
  purchase: RegisterPurchase;
  ctx: MoneyCtx;
  onClose: () => void;
  onVoid: () => void;
  onPay?: () => void;
}) {
  const status = purchaseStatus(p);
  const remaining = Math.max(0, p.owedCents - p.paidCents);
  const local = p.primaryLocal;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalle de la compra</DialogTitle>
          <DialogDescription>Compra Nº {p.controlNumber ?? "—"}</DialogDescription>
        </DialogHeader>

        <div className="divide-y">
          <section className="pb-3">
            <Row label="Estado">
              {status === "VOIDED" && <StatusPill tone="neutral">Anulada</StatusPill>}
              {status === "PAID" && <StatusPill tone="ok">Pagada</StatusPill>}
              {status === "PARTIAL" && <StatusPill tone="warn">Parcial</StatusPill>}
              {status === "CREDIT" && <StatusPill tone="bad">A crédito</StatusPill>}
            </Row>
            <Row label="Proveedor">{p.supplierName}</Row>
            {p.supplierRif && <Row label="RIF">{p.supplierRif}</Row>}
            {p.supplierContact && <Row label="Contacto">{p.supplierContact}</Row>}
            <Row label="Nº de factura">{p.supplierInvoiceNo ?? "—"}</Row>
            <Row label="Nº de control">{p.controlNumber ?? "—"}</Row>
            <Row label="Fecha">{fmtDate(p.createdAt)}</Row>
            <Row label="Sucursal">{p.branchName}</Row>
            <Row label="Responsable">{p.createdByName ?? "No registrado"}</Row>
            <Row label="Documento">{p.fiscal ? <Pill tone="val">Fiscal</Pill> : <Pill>Sin factura</Pill>}</Row>
            {p.note && <Row label="Nota">{p.note}</Row>}
            {p.voided && (
              <Row label="Anulada">
                {p.voidedAt ? fmtDate(p.voidedAt) : "—"}
                {p.voidedByName ? ` · ${p.voidedByName}` : ""}
              </Row>
            )}
          </section>

          <section className="py-3">
            <h3 className="mb-1 text-sm font-bold">Ítems</h3>
            {p.items.map((it, i) => (
              <div key={i} className="flex items-start justify-between gap-2.5 border-b py-2 last:border-0">
                <div className="min-w-0">
                  <b>{it.name}</b>
                  <small className="block text-xs text-muted-foreground">
                    {it.quantity} × <Dual cents={it.unitCostCents} ctx={ctx} local={local} />
                  </small>
                  <small className="block text-xs text-muted-foreground">
                    IVA {TAX_LABEL[it.taxCategory] ?? it.taxCategory} {it.taxRatePercent}% · base {dualAmount(it.baseCents, ctx, local).primary} · IVA{" "}
                    {dualAmount(it.taxCents, ctx, local).primary} · {it.affectsStock ? "Suma al inventario" : "No afecta el inventario"}
                  </small>
                </div>
                <b className="text-right">
                  <Dual cents={it.subtotalCents} ctx={ctx} local={local} />
                </b>
              </div>
            ))}
          </section>

          <section className="py-3">
            <Row label="Base imponible">
              <Dual cents={p.baseCents} ctx={ctx} local={local} />
            </Row>
            <Row label="IVA">
              <Dual cents={p.taxCents} ctx={ctx} local={local} />
            </Row>
            {p.ivaRetainedCents > 0 && (
              <Row label="IVA retenido">
                −<Dual cents={p.ivaRetainedCents} ctx={ctx} local={local} />
              </Row>
            )}
            <Row label="Total de la factura">
              <Dual cents={p.totalCents} ctx={ctx} local={local} />
            </Row>
            {p.ivaRetainedCents > 0 && (
              <Row label="Total a pagar al proveedor">
                <Dual cents={p.owedCents} ctx={ctx} local={local} />
              </Row>
            )}
          </section>

          <section className="py-3">
            <h3 className="mb-1 text-sm font-bold">Pagos</h3>
            {p.payments.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">Sin pagos registrados.</p>
            ) : (
              p.payments.map((pay) => {
                const amt = paymentLineAmount(pay, ctx);
                return (
                  <div key={pay.id} className="flex items-start justify-between gap-2.5 border-b py-2 last:border-0">
                    <div className="min-w-0 text-xs text-muted-foreground">
                      <b className="block text-sm text-foreground">{PAYMENT_METHOD_LABELS[pay.paymentMethod]}</b>
                      {fmtDate(pay.createdAt)}
                      <span className="block">Cuenta: {pay.accountLabel ?? "Efectivo de caja / no indicada"}</span>
                      <span className="block">Referencia: {pay.reference ?? "—"}</span>
                      <span className="block">
                        Tasa: {pay.exchangeRate != null ? pay.exchangeRate.toLocaleString("es-VE", { maximumFractionDigits: 4 }) : "—"}
                      </span>
                      <span className="block">Registrado por: no se guarda</span>
                    </div>
                    <b className="text-right tabular-nums">
                      {amt.primary}
                      {amt.secondary && <small className="block text-xs font-normal text-muted-foreground">{amt.secondary}</small>}
                    </b>
                  </div>
                );
              })
            )}
            {!p.voided && (
              <>
                <Row label="Pagado">
                  <Dual cents={p.paidCents} ctx={ctx} local={local} />
                </Row>
                <Row label="Saldo pendiente">
                  <Dual cents={remaining} ctx={ctx} local={local} />
                </Row>
              </>
            )}
          </section>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {!p.voided && p.paymentStatus === "PENDING" && onPay && <Button onClick={onPay}>Registrar pago</Button>}
          {!p.voided && (
            <Button variant="destructive" onClick={onVoid}>
              Anular compra
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
