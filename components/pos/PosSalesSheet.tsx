"use client";

import { useState, useTransition } from "react";
import { BarChart3Icon, EllipsisVerticalIcon, RotateCcwIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listPosSales, type PosSaleRow } from "@/lib/actions/sales";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, SALE_CHANNEL_LABELS } from "@/lib/format";
import { formatCurrencyCents } from "@/lib/currencies";
import type { PaymentMethod, PaymentStatus, ReferenceCurrency, SaleChannel } from "@prisma/client";

const PERIODS = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7 días" },
  { id: "month", label: "Mes" },
] as const;

// «Ventas del día / del periodo» del POS: lista con filtros y menú ⋯ con «Volver a vender».
export function PosSalesSheet({ referenceCurrency }: { referenceCurrency: ReferenceCurrency }) {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("today");
  const [rows, setRows] = useState<PosSaleRow[] | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function load(p: (typeof PERIODS)[number]["id"]) {
    setPeriod(p);
    start(async () => setRows(await listPosSales(p)));
  }

  function resell(row: PosSaleRow) {
    if (row.items.length === 0) {
      toast.error("Los productos de esa venta ya no existen");
      return;
    }
    window.dispatchEvent(new CustomEvent("kr-pos-resell", { detail: row.items }));
    setMenu(null);
    setOpen(false);
    toast.success("Artículos agregados a la venta actual");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          load(period);
        }}
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-muted px-3.5 text-[13px] font-bold text-primary"
      >
        <BarChart3Icon className="size-4" aria-hidden /> Ventas del día
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ventas del periodo</DialogTitle>
            <DialogDescription>Las más recientes arriba. Con ⋯ puedes volver a vender lo mismo.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <Chip key={p.id} active={period === p.id} onClick={() => load(p.id)}>
                {p.label}
              </Chip>
            ))}
          </div>
          <ul className="flex max-h-[50vh] flex-col divide-y overflow-y-auto">
            {rows === null || pending ? (
              <li className="py-6 text-center text-sm text-muted-foreground">Cargando…</li>
            ) : rows.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted-foreground">No hay ventas en este periodo.</li>
            ) : (
              rows.map((r) => (
                <li key={r.id} className="relative flex items-center gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {r.number != null && <span className="mr-1.5 text-muted-foreground">#{r.number}</span>}
                      {r.customer}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleTimeString("es-VE", { hour: "numeric", minute: "2-digit" })} ·{" "}
                      {SALE_CHANNEL_LABELS[r.channel as SaleChannel]} ·{" "}
                      {r.method ? PAYMENT_METHOD_LABELS[r.method as PaymentMethod] : "—"} ·{" "}
                      {r.voided ? "Anulada" : PAYMENT_STATUS_LABELS[r.paymentStatus as PaymentStatus]}
                    </p>
                  </div>
                  <b className="tabular-nums">{formatCurrencyCents(referenceCurrency, r.totalCents)}</b>
                  <button
                    type="button"
                    aria-label="Acciones de la venta"
                    aria-expanded={menu === r.id}
                    onClick={() => setMenu(menu === r.id ? null : r.id)}
                    className="grid size-9 place-items-center rounded-full hover:bg-muted"
                  >
                    <EllipsisVerticalIcon className="size-4" />
                  </button>
                  {menu === r.id && (
                    <div className="absolute right-0 top-full z-10 flex w-48 flex-col rounded-[14px] bg-popover p-1.5 shadow-(--shadow-float)">
                      <button type="button" disabled={r.voided} onClick={() => resell(r)} className="flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-left text-[13px] font-bold hover:bg-muted disabled:opacity-50">
                        <RotateCcwIcon className="size-4" /> Volver a vender
                      </button>
                      <Link href="/reports#ventas" className="flex min-h-10 items-center gap-2 rounded-[10px] px-3 text-[13px] font-bold hover:bg-muted">
                        Ver detalle en Caja Chica
                      </Link>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
