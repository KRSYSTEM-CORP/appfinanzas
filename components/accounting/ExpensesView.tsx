"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldPair, FIELD_CONTROL } from "@/components/shared/Field";
import { ConfirmSheet, SheetActions } from "@/components/shared/ConfirmSheet";
import { RowMenu } from "@/components/shared/RowMenu";
import { SectionCard, TwoCol } from "@/components/shared/SectionCard";
import { createExpense, deleteExpense } from "@/lib/actions/finance";
import { money } from "@/lib/money-display";
import { todayDateString } from "@/lib/report-types";

export const EXPENSE_CATEGORIES = ["Alquiler", "Nómina", "Servicios públicos", "Mercadeo", "Otros"];
const SERIES = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5", "bg-chart-6", "bg-chart-7"];
const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export type ExpenseItem = {
  id: string;
  description: string;
  category: string | null;
  amountCents: number;
  localAmountCents: number | null;
  enteredInLocal: boolean;
  spentAt: string;
};

// Selector «Todas las categorías» que filtra por ?cat= (fila de filtros de Gastos).
export function ExpenseCategorySelect({ categories, value }: { categories: string[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <select
      aria-label="Categoría"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        if (e.target.value) next.set("cat", e.target.value);
        else next.delete("cat");
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      }}
      className="min-h-11 rounded-full border-0 bg-muted px-4 text-sm font-semibold text-foreground"
    >
      <option value="">Todas las categorías</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}

// Botón «Agregar gasto» con su hoja (descripción, categoría, monto y fecha).
export function AddExpenseButton({
  referenceCurrency,
  localCurrencyCode,
  canUseLocal,
  monthTotalCents,
  categories,
}: {
  referenceCurrency: string;
  localCurrencyCode: string;
  canUseLocal: boolean;
  monthTotalCents: number;
  categories: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "Otros");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"REFERENCE" | "LOCAL">("REFERENCE");
  const [spentAt, setSpentAt] = useState(todayDateString);
  const typed = Math.round((Number(amount) || 0) * 100);
  const sym = referenceCurrency === "EUR" ? "€" : "$";

  function save() {
    const fd = new FormData();
    fd.set("description", description);
    fd.set("category", category);
    fd.set("amount", amount);
    fd.set("currency", currency);
    fd.set("spentAt", spentAt);
    start(async () => {
      const r = await createExpense(fd);
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Gasto guardado");
      setOpen(false);
      setDescription("");
      setAmount("");
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden /> Agregar gasto
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar gasto</DialogTitle>
            <DialogDescription>Se refleja en el total de gastos del mes.</DialogDescription>
          </DialogHeader>
          <Field label="Descripción">
            <input className={FIELD_CONTROL} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej: Reparación de aire acondicionado" />
          </Field>
          <FieldPair>
            <Field label="Categoría">
              <select className={FIELD_CONTROL} value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label={`Monto en ${currency === "LOCAL" ? "Bs" : sym}`}>
              <input className={FIELD_CONTROL} type="number" min="0" step="0.01" inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
          </FieldPair>
          <FieldPair>
            <Field label="Moneda">
              <select className={FIELD_CONTROL} value={currency} onChange={(e) => setCurrency(e.target.value as "REFERENCE" | "LOCAL")}>
                <option value="REFERENCE">{referenceCurrency}</option>
                {canUseLocal && <option value="LOCAL">{localCurrencyCode}</option>}
              </select>
            </Field>
            <Field label="Fecha">
              <input className={FIELD_CONTROL} type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
            </Field>
          </FieldPair>
          <div className="mt-2.5 flex items-center justify-between gap-2.5 border-b py-2.5">
            <span>Total de gastos del mes</span>
            <b className="tabular-nums">{money(referenceCurrency, monthTotalCents + (currency === "REFERENCE" ? typed : 0))}</b>
          </div>
          <SheetActions>
            <Button disabled={pending || !description.trim() || typed <= 0} onClick={save}>
              Guardar gasto
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

// «Gastos por categoría» y «Movimientos» (preview, Balance → Gastos).
export function ExpensesView({
  expenses,
  categories,
  referenceCurrency,
  localCurrencyCode,
  totalCents,
}: {
  expenses: ExpenseItem[];
  categories: string[];
  referenceCurrency: string;
  localCurrencyCode: string;
  totalCents: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toDelete, setToDelete] = useState<ExpenseItem | null>(null);
  const m = (c: number, d: 0 | 2 = 2) => money(referenceCurrency, c, d);
  const by = categories
    .map((c) => [c, expenses.filter((e) => (e.category ?? "Otros") === c).reduce((n, e) => n + e.amountCents, 0)] as const)
    .filter(([c, v]) => v > 0 || EXPENSE_CATEGORIES.includes(c));
  const max = Math.max(1, ...by.map(([, v]) => v));

  function remove() {
    if (!toDelete) return;
    start(async () => {
      const r = await deleteExpense(toDelete.id);
      if (!r.success) toast.error(r.error);
      else toast.success("Gasto eliminado");
      setToDelete(null);
      router.refresh();
    });
  }

  return (
    <TwoCol>
      <SectionCard title="Gastos por categoría" subtitle={<>Total del filtro <b className="text-foreground">{m(totalCents)}</b></>}>
        {by.map(([c, v], i) => (
          <div key={c} className="grid grid-cols-[minmax(80px,1.1fr)_3fr_auto] items-center gap-2.5 py-[7px]">
            <span className="text-[13px] font-semibold">{c}</span>
            <div className="h-2 min-w-[60px] overflow-hidden rounded-full bg-track">
              <span className={`block h-full rounded-full ${SERIES[i % SERIES.length]}`} style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="min-w-[62px] text-right text-[13px] font-bold tabular-nums">{m(v, 0)}</span>
          </div>
        ))}
      </SectionCard>
      <SectionCard title="Movimientos" subtitle="Más recientes primero">
        {expenses.length === 0 && <p className="text-[13px] text-muted-foreground">Sin gastos en este filtro.</p>}
        {expenses.map((e) => {
          const d = new Date(e.spentAt);
          return (
            <div key={e.id} className="flex items-center justify-between gap-2.5 border-b py-2.5">
              <div className="min-w-0">
                <b>{e.description}</b>
                <small className="block text-xs text-muted-foreground">
                  {d.getUTCDate()} {SHORT[d.getUTCMonth()]} · {e.category ?? "Otros"}
                </small>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-right font-bold tabular-nums">
                  {e.enteredInLocal && e.localAmountCents != null ? money(localCurrencyCode, e.localAmountCents) : m(e.amountCents)}
                </span>
                <RowMenu items={[{ label: "Eliminar", danger: true, onSelect: () => setToDelete(e) }]} />
              </div>
            </div>
          );
        })}
        {expenses.length > 0 && (
          <div className="flex items-center justify-between gap-2.5 pt-3">
            <b>Total</b>
            <b className="tabular-nums">{m(totalCents)}</b>
          </div>
        )}
      </SectionCard>
      <ConfirmSheet
        open={toDelete != null}
        onOpenChange={(v) => !v && setToDelete(null)}
        title="¿Eliminar este gasto?"
        description={`«${toDelete?.description ?? ""}» dejará de restarse de la ganancia del periodo.`}
        confirmLabel="Sí, eliminar"
        onConfirm={remove}
        pending={pending}
      />
    </TwoCol>
  );
}
