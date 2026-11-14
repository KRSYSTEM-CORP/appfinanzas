"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { ConfirmSheet, SheetActions } from "@/components/shared/ConfirmSheet";
import { Pill } from "@/components/shared/Pills";
import { RowMenu } from "@/components/shared/RowMenu";
import { Note, SectionCard } from "@/components/shared/SectionCard";
import { createSupplier, deleteSupplier, setSupplierActive, setSupplierRating, updateSupplier } from "@/lib/actions/suppliers";
import type { CostComparisonRow } from "@/lib/actions/purchases";
import { money } from "@/lib/money-display";
import { cn } from "@/lib/utils";

export type SupplierCard = {
  id: string;
  name: string;
  rif: string | null;
  phone: string | null;
  rating: number | null;
  isActive: boolean;
  purchasedCents: number;
  owedCents: number;
  invoices: number;
};

// Estrellas de solo lectura (o clicables con `onRate`), en amarillo de la preview.
export function Stars({ value, onRate, big }: { value: number; onRate?: (v: number) => void; big?: boolean }) {
  return (
    <span className="inline-flex gap-0.5" role={onRate ? "radiogroup" : "img"} aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) =>
        onRate ? (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={Math.round(value) === i}
            aria-label={`${i} estrellas`}
            onClick={() => onRate(i)}
            className={cn("p-0.5 leading-none", big ? "text-[26px]" : "text-xl", i <= Math.round(value) ? "text-warn-solid" : "text-track")}
          >
            ★
          </button>
        ) : (
          <span key={i} aria-hidden className={cn("text-xl leading-none", i <= Math.round(value) ? "text-warn-solid" : "text-track")}>
            ★
          </span>
        )
      )}
    </span>
  );
}

function SupplierSheet({ s, onClose }: { s: SupplierCard | null; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(s?.name ?? "");
  const [rif, setRif] = useState(s?.rif ?? "");
  const [phone, setPhone] = useState(s?.phone ?? "");
  const [pending, start] = useTransition();
  function save() {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("rif", rif);
    fd.set("phone", phone);
    start(async () => {
      const r = s ? await updateSupplier(s.id, fd) : await createSupplier(fd);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success(s ? "Proveedor actualizado" : "Proveedor agregado");
      onClose();
      router.refresh();
    });
  }
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{s ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          <DialogDescription>Aparece en Registrar compra y en la comparativa de costos.</DialogDescription>
        </DialogHeader>
        <Field label="Nombre">
          <input className={FIELD_CONTROL} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Distribuidora Mérida" />
        </Field>
        <Field label="RIF">
          <input className={FIELD_CONTROL} value={rif} onChange={(e) => setRif(e.target.value)} placeholder="J-12345678-9" />
        </Field>
        <Field label="Teléfono">
          <input className={FIELD_CONTROL} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0412-000-0000" />
        </Field>
        <SheetActions>
          <Button disabled={pending || !name.trim()} onClick={save}>
            {s ? "Guardar cambios" : "Guardar proveedor"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}

// Compras → Proveedores (preview): «Nuevo proveedor», tarjetas con estrellas, compras, deuda y facturas.
export function SupplierCards({ suppliers, currency }: { suppliers: SupplierCard[]; currency: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SupplierCard | "new" | null>(null);
  const [toDelete, setToDelete] = useState<SupplierCard | null>(null);
  const [pending, start] = useTransition();
  const m = (c: number) => money(currency, c, 0);

  function act(fn: () => Promise<{ success: boolean; error?: string }>, ok: string) {
    start(async () => {
      const r = await fn();
      if (!r.success) toast.error(r.error ?? "No se pudo completar");
      else toast.success(ok);
      setToDelete(null);
      router.refresh();
    });
  }

  return (
    <>
      <div>
        <Button onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden /> Nuevo proveedor
        </Button>
      </div>
      {suppliers.length === 0 ? (
        <SectionCard>
          <p className="text-[13px] text-muted-foreground">Aún no tienes proveedores registrados.</p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-3.5">
          {suppliers.map((s) => (
            <section key={s.id} className={cn("rounded-[19px] bg-card p-4 shadow-(--shadow-card)", !s.isActive && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-base font-bold tracking-[-0.015em]">{s.name}</h3>
                  <p className="mt-0.5 text-muted-foreground">{[s.rif ? `RIF ${s.rif}` : null, s.phone].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
                </div>
                <RowMenu
                  items={[
                    { label: "Ver compras", href: "/purchases" },
                    { label: "Editar", onSelect: () => setEditing(s) },
                    { label: s.isActive ? "Desactivar" : "Activar", onSelect: () => act(() => setSupplierActive(s.id, !s.isActive), s.isActive ? "Proveedor desactivado" : "Proveedor activado") },
                    { label: "Eliminar", danger: true, onSelect: () => setToDelete(s) },
                  ]}
                />
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <Stars value={s.rating ?? 0} />
                <b>{s.rating ? new Intl.NumberFormat("es-VE", { minimumFractionDigits: 1 }).format(s.rating) : "Sin calificar"}</b>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Pill tone="val">Compras {m(s.purchasedCents)}</Pill>
                {s.owedCents > 0 ? <Pill tone="warn">Debe {m(s.owedCents)}</Pill> : <Pill tone="ok">Al día</Pill>}
                <Pill>{s.invoices} facturas</Pill>
              </div>
            </section>
          ))}
        </div>
      )}
      {editing && <SupplierSheet s={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmSheet
        open={toDelete != null}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="¿Eliminar este proveedor?"
        description={`${toDelete?.name ?? ""} se quitará de la lista. Si tiene compras registradas, desactívalo en su lugar.`}
        confirmLabel="Sí, eliminar"
        onConfirm={() => toDelete && act(() => deleteSupplier(toDelete.id), "Proveedor eliminado")}
        pending={pending}
      />
    </>
  );
}

// «Comparativa de último costo»: el mismo producto con distintos proveedores.
export function CostComparisonCard({ rows, currency }: { rows: CostComparisonRow[]; currency: string }) {
  const [i, setI] = useState(0);
  const r = rows[i];
  const m = (c: number) => money(currency, c);
  const max = r ? Math.max(...r.offers.map((o) => o.lastCostCents), 1) : 1;
  const worst = r ? r.offers[r.offers.length - 1] : null;
  return (
    <SectionCard
      title="Comparativa de último costo"
      subtitle="El mismo producto con distintos proveedores"
      action={
        rows.length > 0 ? (
          <select aria-label="Producto" value={i} onChange={(e) => setI(Number(e.target.value))} className="min-h-11 max-w-full rounded-full border-0 bg-muted px-4 text-sm font-semibold">
            {rows.map((x, k) => (
              <option key={x.productName} value={k}>
                {x.productName}
              </option>
            ))}
          </select>
        ) : null
      }
    >
      {!r ? (
        <p className="text-[13px] text-muted-foreground">Aún no hay productos comprados a más de un proveedor.</p>
      ) : (
        <>
          {r.offers.map((o, k) => (
            <div key={o.supplier} className="grid grid-cols-[minmax(80px,1.1fr)_3fr_auto] items-center gap-2.5 py-[7px]">
              <span className="text-[13px] font-semibold">{o.supplier}</span>
              <div className="h-2 overflow-hidden rounded-full bg-track">
                <span className={cn("block h-full rounded-full", k === 0 ? "bg-ok-solid" : "bg-chart-5")} style={{ width: `${(o.lastCostCents / max) * 100}%` }} />
              </div>
              <span className="min-w-[62px] text-right text-[13px] font-bold tabular-nums">{m(o.lastCostCents)}</span>
            </div>
          ))}
          {worst && worst.lastCostCents > r.bestCostCents && (
            <Note>
              Comprando en <b className="text-foreground">{r.offers[0].supplier}</b> ahorras <b className="text-success">{m(worst.lastCostCents - r.bestCostCents)}</b> por unidad frente al más caro ({r.savingPct} %).
            </Note>
          )}
        </>
      )}
    </SectionCard>
  );
}

// Compras → Calificación: ranking por estrellas; «Calificar» guarda de 1 a 5.
export function SupplierRating({ suppliers }: { suppliers: SupplierCard[] }) {
  const router = useRouter();
  const [rating, setRating] = useState<SupplierCard | null>(null);
  const [value, setValue] = useState(0);
  const [pending, start] = useTransition();
  const ranked = [...suppliers].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  function save() {
    if (!rating) return;
    start(async () => {
      const r = await setSupplierRating(rating.id, value || null);
      if (!r.success) toast.error(r.error);
      else toast.success("Calificación guardada");
      setRating(null);
      router.refresh();
    });
  }
  return (
    <SectionCard title="Calificación de proveedores" subtitle="Promedio de calidad, precio, puntualidad y atención">
      {ranked.length === 0 && <p className="text-[13px] text-muted-foreground">Aún no tienes proveedores registrados.</p>}
      {ranked.map((s, k) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
          <div className="flex min-w-[200px] flex-1 items-center gap-3">
            <b className="w-[26px] text-[22px] text-muted-foreground">{k + 1}</b>
            <div>
              <b>{s.name}</b>
              <div className="flex items-center gap-1.5">
                <Stars value={s.rating ?? 0} /> <b>{s.rating ? new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2 }).format(s.rating) : "—"}</b>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setRating(s);
              setValue(s.rating ?? 0);
            }}
          >
            Calificar
          </Button>
        </div>
      ))}
      {rating && (
        <Dialog open onOpenChange={(v) => !v && setRating(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Calificar a {rating.name}</DialogTitle>
              <DialogDescription>Toma en cuenta calidad, precio, puntualidad y atención.</DialogDescription>
            </DialogHeader>
            <div className="mt-3">
              <Stars big value={value} onRate={setValue} />
            </div>
            <SheetActions>
              <Button disabled={pending || !value} onClick={save}>
                Guardar calificación
              </Button>
              <Button variant="outline" onClick={() => setRating(null)}>
                Cancelar
              </Button>
            </SheetActions>
          </DialogContent>
        </Dialog>
      )}
    </SectionCard>
  );
}
