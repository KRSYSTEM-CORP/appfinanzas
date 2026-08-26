"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Expense } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{formatDate(expense.spentAt)}</TableCell>
                <TableCell>{expense.description}</TableCell>
                <TableCell className="text-muted-foreground">{expense.category ?? "—"}</TableCell>
                <TableCell className="text-right">
                  {formatCurrencyCents(referenceCurrency, expense.amountCents)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(expense.id)}
                  >
                    Eliminar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {expenses.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Sin gastos registrados en este período.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
