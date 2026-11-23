"use client";

import { useState } from "react";
import { WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddFundsDialog, type FundableAccount } from "@/components/accounts/AddFundsDialog";

export type FundsError = { error: string; accountId?: string; shortfallCents?: number; code?: string };

// Aviso cuando un pago sale de una cuenta sin saldo suficiente: dice cuánto falta y ofrece «Agregar fondos».
// Al agregar, avisa con onFunded para que la pantalla reintente el pago.
export function InsufficientFundsNotice({
  failure,
  accounts,
  onFunded,
}: {
  failure: FundsError;
  accounts: FundableAccount[];
  onFunded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const account = failure.code === "INSUFFICIENT_FUNDS" ? accounts.find((a) => a.id === failure.accountId) : undefined;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[14px] border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <p className="font-semibold text-destructive">{failure.error}</p>
      {account && (
        <div>
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            <WalletIcon aria-hidden className="size-4" /> Agregar fondos
          </Button>
        </div>
      )}
      {open && account && (
        <AddFundsDialog
          account={account}
          suggestedCents={failure.shortfallCents}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onFunded();
          }}
        />
      )}
    </div>
  );
}
