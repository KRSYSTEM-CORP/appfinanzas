"use client";

import { useEffect, useState } from "react";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { listSourceAccounts, type SourceAccountRow } from "@/lib/actions/payment-accounts";

// Carga las cuentas desde las que se puede pagar. Falla en silencio: sin cuentas, el pago
// sigue saliendo del efectivo de caja como antes.
export function useSourceAccounts(): SourceAccountRow[] {
  const [accounts, setAccounts] = useState<SourceAccountRow[]>([]);
  useEffect(() => {
    let alive = true;
    listSourceAccounts()
      .then((a) => alive && setAccounts(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return accounts;
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
            {a.label} · {a.currency === "VES" ? "Bs" : "$"}
          </option>
        ))}
      </select>
    </Field>
  );
}
