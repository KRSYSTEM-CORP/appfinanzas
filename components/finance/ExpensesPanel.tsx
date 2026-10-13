"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReceiptTextIcon, SearchIcon, XIcon } from "lucide-react";
import type { Expense, ReferenceCurrency } from "@prisma/client";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDateSlash } from "@/lib/format";
import { formatCurrencyCents, getCurrency } from "@/lib/currencies";
import { createExpense, deleteExpense } from "@/lib/actions/finance";
import { todayDateString } from "@/lib/report-types";

// Expense with its Decimal exchange rate flattened to a number — Prisma's
// Decimal can't cross the server/client boundary.
export type ExpenseRow = Omit<Expense, "exchangeRate"> & { exchangeRate: number | null };

type EntryCurrency = "REFERENCE" | "LOCAL";

function ExpenseSearch({ query, count }: { query: string; count: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentParams = searchParams.toString();
  const [search, setSearch] = useState(query);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(currentParams);
      const trimmed = search.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      const nextParams = params.toString();
      if (nextParams !== currentParams) {
        router.replace(nextParams ? `${pathname}?${nextParams}` : pathname, { scroll: false });
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [currentParams, pathname, router, search]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-sm">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por descripción o categoría"
          aria-label="Buscar gastos por descripción o categoría"
          className="pl-9 pr-9"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Limpiar búsqueda"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {count} {count === 1 ? "gasto" : "gastos"}
        {query ? " encontrados" : " en el período"}
      </p>
    </div>
  );
}

function formatRate(rate: number) {
  return rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function ExpensesPanel({
  expenses,
  referenceCurrency,
  localCurrencyCode,
  rate,
  searchQuery,
}: {
  expenses: ExpenseRow[];
  referenceCurrency: ReferenceCurrency;
  localCurrencyCode: string;
  // Today's local-per-reference rate, or null when the company has no active
  // rate (then expenses can only be entered in the reference currency).
  rate: number | null;
  searchQuery: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<EntryCurrency>("REFERENCE");
  const [spentAt, setSpentAt] = useState(todayDateString);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const referenceSymbol = getCurrency(referenceCurrency).symbol;
  const localSymbol = getCurrency(localCurrencyCode).symbol;
  const canUseLocal = rate != null && localCurrencyCode !== referenceCurrency;

  // Live conversion preview under the amount field.
  const typed = Number(amount);
  let preview: string | null = null;
  if (rate != null && Number.isFinite(typed) && typed > 0) {
    preview =
      currency === "LOCAL"
        ? `≈ ${formatCurrencyCents(referenceCurrency, Math.round((typed * 100) / rate))}`
        : `≈ ${formatCurrencyCents(localCurrencyCode, Math.round(typed * 100 * rate))}`;
  }

  // Period totals: the reference total is complete (every expense has it);
  // the local total only covers expenses that stored a local amount.
  const referenceTotal = expenses.reduce((sum, e) => sum + e.amountCents, 0);
  const withLocal = expenses.filter((e) => e.localAmountCents != null);
  const localTotal = withLocal.reduce((sum, e) => sum + (e.localAmountCents ?? 0), 0);
  const missingLocal = expenses.length - withLocal.length;

  function handleCreate(e: React.MouseEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("description", description);
    formData.set("category", category);
    formData.set("amount", amount);
    formData.set("currency", currency);
    formData.set("spentAt", spentAt);
    startTransition(async () => {
      const result = await createExpense(formData);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDescription("");
      setCategory("");
      setAmount("");
      setCurrency("REFERENCE");
      setSpentAt(todayDateString());
      setOpen(false);
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteExpense(id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }
      router.refresh();
    });
  }

  // What was typed, and (when known) its equivalent in the other currency.
  function amounts(e: ExpenseRow) {
    const reference = formatCurrencyCents(referenceCurrency, e.amountCents);
    const local = e.localAmountCents != null ? formatCurrencyCents(localCurrencyCode, e.localAmountCents) : null;
    return e.enteredInLocal && local
      ? { primary: local, secondary: reference }
      : { primary: reference, secondary: local };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {expenses.length > 0 ? (
          <div
            className="flex flex-col gap-0.5"
            aria-label={searchQuery ? "Total de gastos encontrados" : "Total de gastos del período"}
          >
            <p className="text-xs text-muted-foreground">
              {searchQuery ? "Total de gastos encontrados" : "Total del período seleccionado"}
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {formatCurrencyCents(referenceCurrency, referenceTotal)}
              {withLocal.length > 0 && (
                <span className="font-medium text-muted-foreground">
                  {" · "}
                  {formatCurrencyCents(localCurrencyCode, localTotal)}
                </span>
              )}
            </p>
            {withLocal.length > 0 && missingLocal > 0 && (
              <p className="text-xs text-muted-foreground">
                {localSymbol} no incluye {missingLocal} {missingLocal === 1 ? "gasto anterior" : "gastos anteriores"} sin
                equivalente guardado.
              </p>
            )}
          </div>
        ) : (
          <span />
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button disabled={isPending} />}>Agregar gasto</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar gasto</DialogTitle>
              <DialogDescription>
                Se resta de la ganancia neta estimada del período en el que caiga la fecha.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-description">Descripción</Label>
                <Input
                  id="expense-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Ej. Pago de alquiler</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-category">Categoría (opcional)</Label>
                <Input
                  id="expense-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Ej. Alquiler, Servicios, Nómina</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label id="expense-currency-label">Moneda del gasto</Label>
                <div
                  role="radiogroup"
                  aria-labelledby="expense-currency-label"
                  className="inline-flex w-fit gap-1 rounded-lg border bg-muted p-1"
                >
                  {(
                    [
                      { value: "REFERENCE", label: `${referenceSymbol} ${referenceCurrency}`, disabled: false },
                      { value: "LOCAL", label: `${localSymbol} ${localCurrencyCode}`, disabled: !canUseLocal },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={currency === opt.value}
                      disabled={opt.disabled}
                      onClick={() => setCurrency(opt.value)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:py-2.5 ${
                        currency === opt.value
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {!canUseLocal && (
                  <p className="text-xs text-muted-foreground">
                    Para registrar en {localCurrencyCode} necesitas una tasa de cambio activa en Configuración.
                  </p>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="expense-amount">
                    Monto ({currency === "LOCAL" ? localSymbol : referenceSymbol})
                  </Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {preview && rate != null && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {preview} a la tasa de {formatRate(rate)}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="expense-date">Fecha</Label>
                  <Input
                    id="expense-date"
                    type="date"
                    value={spentAt}
                    onChange={(e) => setSpentAt(e.target.value)}
                  />
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button disabled={isPending} onClick={handleCreate}>
                Agregar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <ExpenseSearch key={searchQuery} query={searchQuery} count={expenses.length} />

      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

      <MasterDetail
        items={expenses}
        label="Gastos"
        empty={
          <div className="rounded-lg border bg-card shadow-xs">
            <EmptyState
              icon={ReceiptTextIcon}
              title={searchQuery ? "No hay gastos que coincidan con tu búsqueda." : "Sin gastos registrados en este período."}
              description={searchQuery ? "Prueba con otra descripción o categoría, o limpia la búsqueda." : undefined}
              className="py-10"
            />
          </div>
        }
        renderRowMobile={(e) => {
          const a = amounts(e);
          return (
            <MobileRow
              title={e.description}
              meta={`${formatDateSlash(e.spentAt)} · ${e.category ?? "Sin categoría"}`}
              amount={
                <span className="flex flex-col items-end">
                  <span className="font-semibold tabular-nums">{a.primary}</span>
                  {a.secondary && (
                    <span className="text-xs font-normal text-muted-foreground tabular-nums">{a.secondary}</span>
                  )}
                </span>
              }
            />
          );
        }}
        renderRow={(e) => {
          const a = amounts(e);
          return (
            <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
                <ReceiptTextIcon className="size-4 text-muted-foreground/60" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{e.description}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatDateSlash(e.spentAt)} · {e.category ?? "Sin categoría"}
                </span>
              </span>
              <span className="flex w-32 shrink-0 flex-col items-end text-right">
                <span className="text-sm font-medium tabular-nums">{a.primary}</span>
                {a.secondary && <span className="text-xs text-muted-foreground tabular-nums">{a.secondary}</span>}
              </span>
            </>
          );
        }}
        renderDetail={(e) => {
          const a = amounts(e);
          return (
            <>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-lg font-semibold leading-tight">{e.description}</h3>
                <p className="text-sm text-muted-foreground">{e.category ?? "Sin categoría"}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Fecha</dt>
                  <dd className="font-medium">{formatDateSlash(e.spentAt)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">
                    Monto registrado en {e.enteredInLocal ? localCurrencyCode : referenceCurrency}
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums">{a.primary}</dd>
                </div>
                {a.secondary && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      Equivalente en {e.enteredInLocal ? referenceCurrency : localCurrencyCode}
                    </dt>
                    <dd className="font-medium tabular-nums">{a.secondary}</dd>
                  </div>
                )}
                {e.exchangeRate != null && (
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">Tasa aplicada</dt>
                    <dd className="font-medium tabular-nums">{formatRate(e.exchangeRate)}</dd>
                  </div>
                )}
              </dl>
              <div className="border-t pt-4">
                <Dialog>
                  <DialogTrigger render={<Button type="button" variant="destructive" disabled={isPending} />}>
                    Eliminar
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>¿Eliminar este gasto?</DialogTitle>
                      <DialogDescription>
                        &quot;{e.description}&quot; dejará de restarse de la ganancia neta del período.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
                      <DialogClose
                        render={<Button variant="destructive" disabled={isPending} />}
                        onClick={() => handleDelete(e.id)}
                      >
                        Eliminar
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </>
          );
        }}
      />
    </div>
  );
}
