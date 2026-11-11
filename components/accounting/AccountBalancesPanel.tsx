"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { setAccountBalanceConfig, type AccountBalanceRow } from "@/lib/actions/payment-accounts";

const METHODS: [string, string][] = [
  ["", "Sin vincular"], ["CASH", "Efectivo"], ["TRANSFER", "Transferencia"], ["POS", "Punto de venta"],
  ["CARD", "Pago móvil / tarjeta"], ["ZELLE", "Zelle"], ["BINANCE", "Binance"], ["PAYPAL", "PayPal"], ["OTHER", "Otro"],
];

function money(cents: number, cur: string) {
  const v = (cents / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return cur === "USD" ? `$${v}` : `Bs ${v}`;
}

export function AccountBalancesPanel({ rows }: { rows: AccountBalanceRow[] }) {
  const totalUsd = rows.filter((r) => r.currency === "USD").reduce((n, r) => n + r.balanceCents, 0);
  const totalVes = rows.filter((r) => r.currency === "VES").reduce((n, r) => n + r.balanceCents, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <p className="text-xs text-muted-foreground">Total en $</p>
          <p className="text-xl font-bold">{money(totalUsd, "USD")}</p>
        </div>
        <div className="rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <p className="text-xs text-muted-foreground">Total en Bs</p>
          <p className="text-xl font-bold">{money(totalVes, "VES")}</p>
        </div>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Aún no tienes cuentas. Crea una en Ajustes → Datos para cobrar.</p>
      )}
      {rows.map((r) => (
        <Row key={r.id} r={r} />
      ))}
    </div>
  );
}

function Row({ r }: { r: AccountBalanceRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cur, setCur] = useState(r.currency);
  const [method, setMethod] = useState(r.linkedMethod ?? "");
  const [opening, setOpening] = useState((r.openingCents / 100).toFixed(2));
  function save() {
    start(async () => {
      await setAccountBalanceConfig(r.id, {
        currency: cur,
        openingCents: Math.round((parseFloat(opening.replace(",", ".")) || 0) * 100),
        linkedMethod: method || null,
      });
      router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold">{r.label}</span>
        <span className="text-lg font-bold">{money(r.balanceCents, r.currency)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Inicial {money(r.openingCents, r.currency)} + cobros {money(r.collectedCents, r.currency)}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <select aria-label="Moneda" value={cur} onChange={(e) => setCur(e.target.value)} className="h-10 rounded-xl border bg-background px-2 text-sm">
          <option value="USD">$ Dólares</option>
          <option value="VES">Bs</option>
        </select>
        <Input aria-label="Saldo inicial" inputMode="decimal" value={opening} onChange={(e) => setOpening(e.target.value)} />
        <select aria-label="Método vinculado" value={method} onChange={(e) => setMethod(e.target.value)} className="h-10 rounded-xl border bg-background px-2 text-sm">
          {METHODS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
      <Button size="sm" disabled={pending} onClick={save} className="self-end">Guardar</Button>
    </div>
  );
}
