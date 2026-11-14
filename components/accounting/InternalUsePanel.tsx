"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpenIcon, PlusIcon, ShoppingCartIcon, UserIcon, UsersIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { ConfirmSheet, SheetActions } from "@/components/shared/ConfirmSheet";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { RowMenu } from "@/components/shared/RowMenu";
import { Note, SectionCard, TwoCol } from "@/components/shared/SectionCard";
import { deleteInternalUse, registerInternalUse, type InternalUseRow } from "@/lib/actions/products";
import { bsOf, money } from "@/lib/money-display";

const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const KIND: Record<string, string> = { SOCIO: "socio", PERSONAL: "personal" };

type Product = { id: string; name: string; stock: number; costCents: number };

// «Agregar retiro»: quién retira, tipo (Socio o Personal), producto con buscador y cantidad.
export function AddWithdrawalButton({ products, currency }: { products: Product[]; currency: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [kind, setKind] = useState<"SOCIO" | "PERSONAL">("SOCIO");
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("1");
  const [pending, start] = useTransition();
  const q = search.trim().toLowerCase();
  const matches = (q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products).slice(0, 8);

  function save() {
    start(async () => {
      const r = await registerInternalUse(productId, Number(qty), "", { kind, name: who });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      const p = products.find((x) => x.id === productId);
      toast.success(`Retiro agregado · costo ${money(currency, (p?.costCents ?? 0) * Number(qty))}`);
      setOpen(false);
      setWho("");
      setSearch("");
      setProductId("");
      setQty("1");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden /> Agregar retiro
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar retiro</DialogTitle>
            <DialogDescription>No es una venta, pero descuenta inventario.</DialogDescription>
          </DialogHeader>
          <Field label="Quién retira">
            <input className={FIELD_CONTROL} value={who} onChange={(e) => setWho(e.target.value)} placeholder="Nombre" />
          </Field>
          <Field label="Tipo">
            <select className={FIELD_CONTROL} value={kind} onChange={(e) => setKind(e.target.value as "SOCIO" | "PERSONAL")}>
              <option value="SOCIO">Socio</option>
              <option value="PERSONAL">Personal</option>
            </select>
          </Field>
          <Field label="Producto">
            <input className={FIELD_CONTROL} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" />
          </Field>
          <div className="mt-1.5 flex max-h-44 flex-col overflow-y-auto rounded-[12px] border">
            {matches.length === 0 ? (
              <p className="p-2.5 text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={productId === p.id}
                  onClick={() => setProductId(p.id)}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${productId === p.id ? "bg-accent font-semibold text-primary" : ""}`}
                >
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    costo {money(currency, p.costCents)} · {p.stock} en stock
                  </span>
                </button>
              ))
            )}
          </div>
          <FieldPair>
            <Field label="Cantidad">
              <input className={FIELD_CONTROL} type="number" min="1" step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <span />
          </FieldPair>
          <SheetActions>
            <Button disabled={pending || !productId || !who.trim() || !(Number(qty) > 0)} onClick={save}>
              Guardar retiro
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </SheetActions>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Consumo Interno (preview): KPI, «Quién retira más», «Cómo funciona» y la tabla de retiros.
export function InternalUsePanel({ rows, currency, rate, periodLabel }: { rows: InternalUseRow[]; currency: string; rate: number | null; periodLabel: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [del, setDel] = useState<InternalUseRow | null>(null);
  const m = (c: number) => money(currency, c);
  const total = rows.reduce((n, r) => n + r.costCents, 0);
  const socios = rows.filter((r) => r.kind === "SOCIO").reduce((n, r) => n + r.costCents, 0);
  const personal = rows.filter((r) => r.kind === "PERSONAL").reduce((n, r) => n + r.costCents, 0);
  const byWho = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.who}${r.kind ? ` (${KIND[r.kind]})` : ""}`;
    byWho.set(k, (byWho.get(k) ?? 0) + r.costCents);
  }
  const top = [...byWho.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const max = top[0]?.[1] || 1;

  function remove() {
    if (!del) return;
    start(async () => {
      const r = await deleteInternalUse(del.id);
      if (!r.success) toast.error(r.error);
      else toast.success("Retiro eliminado · la mercancía vuelve al inventario");
      setDel(null);
      router.refresh();
    });
  }

  return (
    <>
      <KpiGrid>
        <Kpi tone="warn" icon={<ShoppingCartIcon />} label="Costo real retirado" value={m(total)} hint={[`${rows.length} retiros`, bsOf(total, rate)].filter(Boolean).join(" · ")} />
        <Kpi tone="info" icon={<UserIcon />} label="Socios" value={m(socios)} hint="Retiros de dueños" />
        <Kpi tone="ok" icon={<UsersIcon />} label="Personal" value={m(personal)} hint="Retiros de trabajadores" />
        <Kpi tone="info" icon={<BookOpenIcon />} label="Venta registrada" value={money(currency, 0, 0)} hint="No cuenta como venta" />
      </KpiGrid>
      <TwoCol>
        <SectionCard title="Quién retira más" subtitle={`Costo real por persona · ${periodLabel}`}>
          {top.length === 0 && <p className="text-[13px] text-muted-foreground">Sin retiros en este periodo.</p>}
          {top.map(([who, c]) => (
            <div key={who} className="grid grid-cols-[minmax(80px,1.1fr)_3fr_auto] items-center gap-2.5 py-[7px]">
              <span className="text-[13px] font-semibold">{who}</span>
              <div className="h-2 overflow-hidden rounded-full bg-track">
                <span className="block h-full rounded-full bg-warn-solid" style={{ width: `${(c / max) * 100}%` }} />
              </div>
              <span className="min-w-[62px] text-right text-[13px] font-bold tabular-nums">{m(c)}</span>
            </div>
          ))}
        </SectionCard>
        <SectionCard title="Cómo funciona" subtitle="Control solo de lo que sale para trabajadores y socios">
          <div className="flex items-center justify-between gap-2.5 border-b py-2.5">
            <b>No es una venta</b>
            <span className="text-muted-foreground">No suma ingresos</span>
          </div>
          <div className="flex items-center justify-between gap-2.5 border-b py-2.5">
            <b>Inventario</b>
            <span className="text-muted-foreground">Descuenta al costo</span>
          </div>
          <div className="flex items-center justify-between gap-2.5 py-2.5">
            <b>Sale sin ingreso</b>
            <span className="text-muted-foreground">Entra al Análisis de costo</span>
          </div>
          <Note>Registra aquí cada producto que retira un socio o un trabajador para que el inventario cuadre.</Note>
        </SectionCard>
      </TwoCol>
      <SectionCard flush title="Retiros del periodo" subtitle="Cada retiro se puede eliminar con ⋯">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-muted-foreground">Sin retiros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-bold text-muted-foreground [&>th]:px-3.5 [&>th]:py-[11px]">
                  <th>Fecha</th>
                  <th>Quién</th>
                  <th>Producto</th>
                  <th className="text-right">Cant.</th>
                  <th className="text-right">Costo unit.</th>
                  <th className="text-right">Costo real</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const d = new Date(r.date);
                  return (
                    <tr key={r.id} className="border-b [&>td]:px-3.5 [&>td]:py-[11px]">
                      <td>
                        {d.getDate()} {SHORT[d.getMonth()]}
                      </td>
                      <td>
                        {r.who}
                        {r.kind ? ` (${KIND[r.kind]})` : ""}
                      </td>
                      <td>{r.productName}</td>
                      <td className="text-right tabular-nums">{r.quantity}</td>
                      <td className="text-right tabular-nums">{m(r.quantity ? Math.round(r.costCents / r.quantity) : 0)}</td>
                      <td className="text-right tabular-nums">{m(r.costCents)}</td>
                      <td className="text-right">
                        <RowMenu items={[{ label: "Eliminar", danger: true, onSelect: () => setDel(r) }]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold [&>td]:px-3.5 [&>td]:py-[11px]">
                  <td colSpan={5} className="text-right">
                    Total
                  </td>
                  <td className="text-right tabular-nums">{m(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>
      <ConfirmSheet
        open={del != null}
        onOpenChange={(v) => !v && setDel(null)}
        title="¿Eliminar este retiro?"
        description="La mercancía vuelve al inventario."
        confirmLabel="Sí, eliminar"
        onConfirm={remove}
        pending={pending}
      />
    </>
  );
}
