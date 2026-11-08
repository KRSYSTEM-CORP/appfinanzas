"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
} from "@/components/ui/dialog";
import { PaymentAccountsList } from "@/components/payments/PaymentAccountsList";
import {
  BANKS,
  ACCOUNT_KIND_LABELS,
  ACCOUNT_NUMBER_LABELS,
  bankLabel,
  defaultBankKey,
  type AccountKind,
} from "@/lib/payment-accounts";
import {
  deletePaymentAccount,
  savePaymentAccount,
  setPaymentAccountActive,
  type PaymentAccountRow,
} from "@/lib/actions/payment-accounts";

const KINDS = Object.keys(ACCOUNT_KIND_LABELS) as AccountKind[];

export function PaymentAccountsForm({ accounts }: { accounts: PaymentAccountRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PaymentAccountRow | "new" | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setEditing("new")}>Agregar cuenta</Button>
      </div>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no tienes cuentas de cobro. Agrega tus pagos móviles, cuentas, Zelle o Binance para que aparezcan en el
          punto de venta.
        </p>
      ) : (
        <PaymentAccountsList
          accounts={accounts}
          actions={(a) => (
            <>
              <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" disabled={isPending} onClick={() => run(() => setPaymentAccountActive(a.id, !a.active))}>
                {a.active ? "Ocultar" : "Mostrar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => {
                  if (window.confirm("¿Eliminar esta cuenta de cobro?")) run(() => deletePaymentAccount(a.id));
                }}
              >
                Eliminar
              </Button>
            </>
          )}
        />
      )}
      {editing && (
        <AccountDialog
          key={editing === "new" ? "new" : editing.id}
          account={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AccountDialog({
  account,
  onClose,
  onSaved,
}: {
  account: PaymentAccountRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "PAGO_MOVIL");
  const [bankKey, setBankKey] = useState(account?.bankKey ?? "");
  const [holder, setHolder] = useState(account?.holder ?? "");
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [docId, setDocId] = useState(account?.docId ?? "");
  const [note, setNote] = useState(account?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const needsBank = kind === "PAGO_MOVIL" || kind === "TRANSFER";

  function save() {
    setError(null);
    const key = needsBank ? bankKey : defaultBankKey(kind) ?? "";
    startTransition(async () => {
      const result = await savePaymentAccount(
        {
          kind,
          bankKey: key,
          bankName: bankLabel(key) ?? "",
          holder,
          accountNumber,
          docId,
          note,
        },
        account?.id
      );
      if (result.success) onSaved();
      else setError(result.error);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Editar cuenta de cobro" : "Agregar cuenta de cobro"}</DialogTitle>
          <DialogDescription>Estos datos se muestran en el punto de venta para dárselos al cliente.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-kind">Tipo</Label>
            <select
              id="pa-kind"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as AccountKind)}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {ACCOUNT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          {needsBank && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-bank">Banco</Label>
              <select
                id="pa-bank"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={bankKey}
                onChange={(e) => setBankKey(e.target.value)}
              >
                <option value="">Selecciona un banco</option>
                {BANKS.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-num">{ACCOUNT_NUMBER_LABELS[kind]}</Label>
            <Input id="pa-num" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-doc">Cédula / RIF (opcional)</Label>
              <Input id="pa-doc" value={docId} onChange={(e) => setDocId(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-holder">Titular (opcional)</Label>
              <Input id="pa-holder" value={holder} onChange={(e) => setHolder(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-note">Nota (opcional)</Label>
            <Input id="pa-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Solo en horario de oficina" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button disabled={isPending} onClick={save}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
