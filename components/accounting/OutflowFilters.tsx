"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OUTFLOW_METHOD_LABEL } from "@/lib/cash-outflow";
import type { PaymentMethod } from "@prisma/client";

const SELECT = "min-h-11 rounded-full border-0 bg-muted px-4 text-sm font-semibold text-foreground";

// Filtros de «Salidas y devoluciones»: método y cuenta (?method= y ?account=).
export function OutflowFilters({ method, accountId, accounts }: { method: string; accountId: string; accounts: { id: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  function set(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  return (
    <div className="flex flex-wrap gap-2">
      <select aria-label="Método" value={method} onChange={(e) => set("method", e.target.value)} className={SELECT}>
        <option value="">Todos los métodos</option>
        {(Object.keys(OUTFLOW_METHOD_LABEL) as PaymentMethod[]).map((m) => (
          <option key={m} value={m}>
            {OUTFLOW_METHOD_LABEL[m]}
          </option>
        ))}
      </select>
      <select aria-label="Cuenta" value={accountId} onChange={(e) => set("account", e.target.value)} className={SELECT}>
        <option value="">Todas las cuentas</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  );
}
