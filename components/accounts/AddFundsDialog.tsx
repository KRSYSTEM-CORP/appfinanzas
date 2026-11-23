"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { SheetActions } from "@/components/shared/ConfirmSheet";
import { addAccountFunds } from "@/lib/actions/payment-accounts";

export type FundableAccount = { id: string; label: string; currency: string };

// Moneda de la cuenta en texto corto: «Bs.» o «$».
export function accountCurrencySymbol(currency: string): string {
  return currency === "VES" ? "Bs." : "$";
}

export function formatAccountMoney(currency: string, cents: number): string {
  const n = (cents / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${accountCurrencySymbol(currency)}${currency === "VES" ? " " : ""}${n}`;
}

// «Agregar fondos»: inyecta dinero a una cuenta (aporte, depósito, saldo que faltaba) para poder pagar desde ella.
export function AddFundsDialog({
  account,
  suggestedCents,
  onClose,
  onDone,
}: {
  account: FundableAccount;
  // Lo que falta para cubrir el pago que se intentó, en la moneda de la cuenta.
  suggestedCents?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(suggestedCents ? (suggestedCents / 100).toFixed(2) : "");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const cents = Math.round((parseFloat(amount.replace(",", ".")) || 0) * 100);

  function save() {
    start(async () => {
      const r = await addAccountFunds({ accountId: account.id, amountCents: cents, note });
      if (!r.success) {
        toast.error(r.error);
        return;
      }
      toast.success("Fondos agregados a la cuenta");
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar fondos</DialogTitle>
          <DialogDescription>
            Suma dinero al saldo de <b>{account.label}</b>. Úsalo cuando metas efectivo, hagas un depósito o el saldo no refleje lo que de verdad tiene la cuenta.
          </DialogDescription>
        </DialogHeader>
        <Field label={`Monto a agregar (${account.currency === "VES" ? "bolívares" : "divisa"})`}>
          <input className={FIELD_CONTROL} inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Nota (opcional)">
          <input className={FIELD_CONTROL} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: depósito del dueño" maxLength={200} />
        </Field>
        <SheetActions>
          <Button disabled={pending || cents < 1} onClick={save}>
            Agregar {cents > 0 ? formatAccountMoney(account.currency, cents) : "fondos"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
        </SheetActions>
      </DialogContent>
    </Dialog>
  );
}
