"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ReceiptTextIcon } from "lucide-react";
import type { Expense } from "@prisma/client";
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
import { formatDate } from "@/lib/format";
import { formatCurrencyCents } from "@/lib/currencies";
import { createExpense, deleteExpense } from "@/lib/actions/finance";
import { todayDateString } from "@/lib/report-types";
import type { ReferenceCurrency } from "@prisma/client";

export function ExpensesPanel({
  expenses,
  referenceCurrency,
}: {
  expenses: Expense[];
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(todayDateString);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleCreate(e: React.MouseEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("description", description);
    formData.set("category", category);
    formData.set("amount", amount);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
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
              <div className="flex gap-3">
                <div className="flex flex-col gap-1.5 flex-1">
                  <Label htmlFor="expense-amount">Monto</Label>
                  <Input
                    id="expense-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
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

      {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}

      <MasterDetail
        items={expenses}
        label="Gastos"
        empty={
          <div className="rounded-lg border bg-card shadow-xs">
            <EmptyState icon={ReceiptTextIcon} title="Sin gastos registrados en este período." className="py-10" />
          </div>
        }
        renderRowMobile={(e) => (
          <MobileRow
            title={e.description}
            meta={`${formatDate(e.spentAt)} · ${e.category ?? "Sin categoría"}`}
            amount={<span className="font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, e.amountCents)}</span>}
          />
        )}
        renderRow={(e) => (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
              <ReceiptTextIcon className="size-4 text-muted-foreground/60" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{e.description}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatDate(e.spentAt)} · {e.category ?? "Sin categoría"}
              </span>
            </span>
            <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums">
              {formatCurrencyCents(referenceCurrency, e.amountCents)}
            </span>
          </>
        )}
        renderDetail={(e) => (
          <>
            <div className="flex flex-col gap-0.5">
              <h3 className="text-lg font-semibold leading-tight">{e.description}</h3>
              <p className="text-sm text-muted-foreground">{e.category ?? "Sin categoría"}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Fecha</dt>
                <dd className="font-medium">{formatDate(e.spentAt)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Monto</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, e.amountCents)}</dd>
              </div>
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
        )}
      />
    </div>
  );
}
