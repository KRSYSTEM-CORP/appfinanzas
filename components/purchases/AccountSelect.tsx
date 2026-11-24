"use client";

import { useEffect, useState } from "react";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { listSourceAccounts, type SourceAccountRow } from "@/lib/actions/payment-accounts";
import { formatAccountMoney } from "@/components/accounts/AddFundsDialog";

// Carga las cuentas desde las que se puede pagar. Falla en silencio: sin cuentas, el pago
// sigue saliendo del efectivo de caja como antes.
export function useSourceAccounts(): SourceAccountRow[] {
  return useSourceAccountsReload().accounts;
}

// Igual, pero devuelve también «reload» para actualizar los saldos después de agregar fondos.
export function useSourceAccountsReload(includePos = false, enabled = true): { accounts: SourceAccountRow[]; reload: () => void } {
  const [accounts, setAccounts] = useState<SourceAccountRow[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    listSourceAccounts(includePos)
      .then((a) => alive && setAccounts(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [tick, includePos, enabled]);
  return { accounts, reload: () => setTick((t) => t + 1) };
}

// «¿De qué cuenta salió el dinero?»: descuenta el pago del saldo de esa cuenta.
export function AccountSelect({
  accounts,
  value,
  onChange,
  label = "¿De qué cuenta salió el dinero?",
}: {
  accounts: SourceAccountRow[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  if (accounts.length === 0) return null;
  return (
    <Field label={label}>
      <select className={FIELD_CONTROL} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Efectivo de caja (no descuenta de una cuenta)</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label} · saldo {formatAccountMoney(a.currency, a.balanceCents)}
          </option>
        ))}
      </select>
    </Field>
  );
}
