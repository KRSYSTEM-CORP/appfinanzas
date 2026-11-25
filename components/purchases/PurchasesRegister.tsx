"use client";

import { useState, useTransition } from "react";
import Link from "@/components/ui/nav-link";
import { useRouter } from "next/navigation";
import { DownloadIcon, PlusIcon, ShoppingCartIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmSheet } from "@/components/shared/ConfirmSheet";
import { Pill, StatusPill } from "@/components/shared/Pills";
import { RowMenu } from "@/components/shared/RowMenu";
import { SectionCard } from "@/components/shared/SectionCard";
import { PayDialog } from "@/components/purchases/PaymentOrdersPanel";
import { voidPurchase, type PaymentOrderRow } from "@/lib/actions/purchases";
import type { RestockSuggestion } from "@/lib/actions/reports";
import { money } from "@/lib/money-display";
import { downloadWorkbook } from "@/lib/spreadsheet";
import { dualAmount, purchaseStatus, type MoneyCtx } from "@/lib/money-primary";
import { PurchaseDetailDialog, type RegisterPurchase } from "@/components/purchases/PurchaseDetailDialog";
import { cn } from "@/lib/utils";

const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type { RegisterPurchase };

// «Sugerencia de compra»: productos que se acaban, cuánto pedir y el costo estimado.
export function RestockCard({ rows, currency }: { rows: RestockSuggestion[]; currency: string }) {
  const total = rows.reduce((n, r) => n + (r.estimatedCostCents ?? 0), 0);
  return (
    <SectionCard title="Sugerencia de compra" subtitle="Productos con stock bajo: KR POS calcula cuánto pedir para llegar al nivel ideal">
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Tu inventario cubre las ventas de los próximos días. No hace falta reponer.</p>
      ) : (
        <>
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2.5 border-b py-2.5">
              <div className="min-w-0">
                <b>{r.name}</b>
                <small className="block text-xs text-muted-foreground">
                  Stock {r.stock}
                  {r.daysLeft != null ? ` · alcanza para ${r.daysLeft} días` : ""}
                </small>
                <small className="block text-xs text-muted-foreground">
                  Vendiste {r.soldInWindow} en 30 días (≈ {r.perDay < 10 ? r.perDay.toFixed(1) : Math.round(r.perDay)} por día). Nivel ideal {r.idealQty}
                  {" "}= 14 días de ventas (mínimo {r.minStock}, tope lo vendido en 30 días). Pedir {r.idealQty} − {Math.max(0, r.stock)} en stock.
                </small>
              </div>
              <div className="text-right font-bold tabular-nums">
                Pedir {r.suggestedQty}
                {r.estimatedCostCents != null && (
                  <small className="block text-xs font-semibold text-muted-foreground">
                    {money(currency, Math.round(r.estimatedCostCents / r.suggestedQty))} c/u · {money(currency, r.estimatedCostCents)}
                  </small>
                )}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3">
            <b>Orden sugerida: {money(currency, total)}</b>
            <Button nativeButton={false} render={<Link href="/purchases/new" />}>
              <ShoppingCartIcon aria-hidden /> Crear orden de compra
            </Button>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// «Compras del periodo»: tabla con proveedor, concepto, factura, total, estado y menú ⋯.
export function PurchasesTable({ purchases, ctx }: { purchases: RegisterPurchase[]; ctx: MoneyCtx }) {
  const currency = ctx.referenceCurrency;
  const router = useRouter();
  const [supplier, setSupplier] = useState("");
  const [view, setView] = useState<RegisterPurchase | null>(null);
  const [paying, setPaying] = useState<PaymentOrderRow | null>(null);
  const [toVoid, setToVoid] = useState<RegisterPurchase | null>(null);
  const [pending, start] = useTransition();
  const suppliers = [...new Set(purchases.map((p) => p.supplierName))].sort();
  const shown = supplier ? purchases.filter((p) => p.supplierName === supplier) : purchases;
  const total = shown.filter((p) => !p.voided).reduce((n, p) => n + p.totalCents, 0);

  const Amt = ({ cents, local }: { cents: number; local: boolean }) => {
    const d = dualAmount(cents, ctx, local);
    return (
      <>
        {d.primary}
        {d.secondary && <small className="block text-xs font-normal text-muted-foreground">{d.secondary}</small>}
      </>
    );
  };

  function status(p: RegisterPurchase) {
    const st = purchaseStatus(p);
    if (st === "VOIDED") return <StatusPill tone="neutral">Anulada</StatusPill>;
    if (st === "PAID") return <StatusPill tone="ok">Pagada</StatusPill>;
    if (st === "PARTIAL") return <StatusPill tone="warn">Parcial</StatusPill>;
    return <StatusPill tone="bad">A crédito</StatusPill>;
  }

  function payOrder(p: RegisterPurchase): PaymentOrderRow {
    return {
      id: p.id,
      controlNumber: p.controlNumber,
      supplierName: p.supplierName,
      createdAt: p.createdAt,
      ageDays: 0,
      totalCents: p.totalCents,
      owedCents: p.owedCents,
      paidCents: p.paidCents,
      remainingCents: Math.max(0, p.owedCents - p.paidCents),
      primaryLocal: p.primaryLocal,
    };
  }

  // «Exportar Excel»: las compras que se ven (filtro de proveedor incluido), una fila por compra.
  async function exportExcel() {
    try {
      await downloadWorkbook(
        [
          {
            name: "Compras",
            rows: [
              ["Fecha", "N.º control", "Proveedor", "Factura", "Concepto", "Base", "IVA", "Total", "Pagado", "Estado"],
              ...shown.map((p) => [
                p.createdAt.slice(0, 10),
                p.controlNumber ?? "",
                p.supplierName,
                p.supplierInvoiceNo ?? "",
                p.concept,
                p.baseCents / 100,
                p.taxCents / 100,
                p.totalCents / 100,
                p.paidCents / 100,
                p.voided ? "Anulada" : p.paymentStatus === "PAID" ? "Pagada" : p.paidCents > 0 ? "Parcial" : "A crédito",
              ]),
            ],
          },
        ],
        "compras.xlsx"
      );
    } catch {
      toast.error("No se pudo generar el Excel. Inténtalo de nuevo.");
    }
  }

  function doVoid() {
    if (!toVoid) return;
    start(async () => {
      const r = await voidPurchase(toVoid.id);
      if (!r.success) toast.error(r.error);
      else toast.success("Compra anulada");
      setToVoid(null);
      setView(null);
      router.refresh();
    });
  }

  return (
    <SectionCard
      flush
      title="Compras del periodo"
      subtitle="Más recientes primero · las anuladas se tachan y no suman"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Proveedor" value={supplier} onChange={(e) => setSupplier(e.target.value)} className="min-h-10 rounded-full border-0 bg-muted px-4 text-sm font-semibold">
            <option value="">Todos los proveedores</option>
            {suppliers.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <Button type="button" variant="outline" onClick={exportExcel}>
            <DownloadIcon aria-hidden /> Exportar Excel
          </Button>
          <Button nativeButton={false} render={<Link href="/purchases/new" />}>
            <PlusIcon aria-hidden /> Registrar compra
          </Button>
        </div>
      }
    >
      {shown.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-muted-foreground">Sin compras en este periodo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-bold text-muted-foreground [&>th]:px-3.5 [&>th]:py-[11px]">
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Concepto</th>
                <th>Factura</th>
                <th className="text-right">Total</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => {
                const d = new Date(p.createdAt);
                return (
                  <tr key={p.id} className={cn("border-b [&>td]:px-3.5 [&>td]:py-[11px]", p.voided && "text-muted-foreground line-through")}>
                    <td className="whitespace-nowrap">
                      {d.getDate()} {SHORT[d.getMonth()]}
                    </td>
                    <td className="font-bold">{p.supplierName}</td>
                    <td>{p.concept}</td>
                    <td>{p.fiscal ? <Pill tone="val">Fiscal</Pill> : <Pill>Sin factura</Pill>}</td>
                    <td className="text-right tabular-nums"><Amt cents={p.totalCents} local={p.primaryLocal} /></td>
                    <td className="no-underline">{status(p)}</td>
                    <td className="text-right">
                      <RowMenu
                        items={[
                          { label: "Ver detalle", onSelect: () => setView(p) },
                          ...(!p.voided && p.paymentStatus === "PENDING" ? [{ label: "Registrar pago", onSelect: () => setPaying(payOrder(p)) }] : []),
                          ...(!p.voided ? [{ label: "Anular compra", danger: true, onSelect: () => setToVoid(p) }] : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-bold [&>td]:px-3.5 [&>td]:py-[11px]">
                <td colSpan={4} className="text-right">
                  Total (sin anuladas)
                </td>
                <td className="text-right tabular-nums">{money(currency, total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {view && (
        <PurchaseDetailDialog
          purchase={view}
          ctx={ctx}
          onClose={() => setView(null)}
          onVoid={() => setToVoid(view)}
          onPay={() => {
            setPaying(payOrder(view));
            setView(null);
          }}
        />
      )}
      {paying && <PayDialog order={paying} ctx={ctx} onClose={() => setPaying(null)} />}
      <ConfirmSheet
        open={toVoid != null}
        onOpenChange={(v) => !v && setToVoid(null)}
        title="¿Anular esta compra?"
        description={
          <>
            Se anula la compra Nº {toVoid?.controlNumber ?? "—"} de {toVoid?.supplierName}. Esto revierte:
            <span className="mt-2 block">
              · Existencias: baja del inventario lo que entró con ella. Si parte ya se vendió, no se anula y se te avisa qué falta.
            </span>
            <span className="block">
              · Pagos: los {toVoid?.payments.length ?? 0} pago(s) registrados dejan de contar y el dinero vuelve al saldo de las cuentas de donde salió.
            </span>
            <span className="block">· Cuentas por pagar: sale de las órdenes de pago. Queda tachada en la lista y no se puede deshacer.</span>
          </>
        }
        confirmLabel="Sí, anular"
        onConfirm={doVoid}
        pending={pending}
      />
    </SectionCard>
  );
}
