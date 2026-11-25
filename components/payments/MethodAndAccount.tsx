"use client";

import { useEffect } from "react";
import { BanknoteIcon, CheckIcon, CreditCardIcon, LandmarkIcon, SmartphoneIcon, WalletIcon } from "lucide-react";
import { bankLogoSrc } from "@/lib/payment-accounts";
import { accountsForMethod, defaultAccountFor } from "@/lib/payment-method-accounts";
import { formatAccountMoney } from "@/components/accounts/AddFundsDialog";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@prisma/client";

// Los mismos mosaicos de «Método de pago» del cobro del POS, para que cobranza, compras, gastos y nómina
// se vean y se usen igual.
const SHORT: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  CARD: "Pago Móvil",
  POS: "Punto de venta",
  TRANSFER: "Transferencia",
  ZELLE: "Zelle",
  BINANCE: "Binance",
  PAYPAL: "PayPal",
  OTHER: "Otro",
};
const ORDER: PaymentMethod[] = ["CASH", "CARD", "POS", "TRANSFER", "ZELLE", "BINANCE", "PAYPAL", "OTHER"];
const LOGO: Partial<Record<PaymentMethod, string>> = { ZELLE: "zelle", BINANCE: "binance", PAYPAL: "paypal" };

function Icon({ method }: { method: PaymentMethod }) {
  const logo = LOGO[method] ? bankLogoSrc(LOGO[method]) : null;
  if (logo) {
    return (
      <span className="mb-1 grid size-[38px] place-items-center overflow-hidden rounded-[12px] bg-white shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" className="block max-h-[78%] max-w-[78%] object-contain" />
      </span>
    );
  }
  const I = method === "CARD" ? SmartphoneIcon : method === "POS" ? CreditCardIcon : method === "TRANSFER" ? LandmarkIcon : method === "OTHER" ? WalletIcon : BanknoteIcon;
  return (
    <span className="mb-1 grid size-[38px] place-items-center rounded-[12px] bg-card text-primary">
      <I className="size-5" aria-hidden />
    </span>
  );
}

export function MethodTiles({ value, onChange, methods = ORDER, label = "Método de pago" }: { value: PaymentMethod; onChange: (m: PaymentMethod) => void; methods?: PaymentMethod[]; label?: string }) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,108px),1fr))] gap-2">
      {methods.map((m) => {
        const on = value === m;
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(m)}
            className={cn(
              "relative flex flex-col items-center gap-0.5 rounded-[18px] border-2 px-2 py-3 text-center transition-[border-color,background-color,transform] duration-150 active:scale-[0.97]",
              on ? "border-primary bg-primary/12" : "border-transparent bg-muted"
            )}
          >
            <Icon method={m} />
            <b className="text-[13px] font-bold">{SHORT[m]}</b>
            {on && (
              <span className="absolute top-1.5 right-1.5 grid size-[20px] place-items-center rounded-full bg-primary text-primary-foreground">
                <CheckIcon className="size-3" strokeWidth={3} aria-hidden />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type PickableAccount = { id: string; label: string; currency: string; kind?: string; balanceCents?: number };

// Método (mosaicos del POS) + cuenta de la que salió el dinero: al elegir un método que sale de un banco o servicio,
// muestra las cuentas de ese tipo con su saldo y elige sola la única que haya.
export function MethodAndAccount({
  method,
  onMethod,
  accounts,
  accountId,
  onAccount,
  methods,
  accountLabel = "¿De qué cuenta salió el dinero?",
}: {
  method: PaymentMethod;
  onMethod: (m: PaymentMethod) => void;
  accounts: PickableAccount[];
  accountId: string;
  onAccount: (id: string) => void;
  methods?: PaymentMethod[];
  accountLabel?: string;
}) {
  const options = accountsForMethod(method, accounts);
  // Las cuentas pueden llegar después de montar el selector (carga asíncrona): si el método ya tiene cuentas y
  // ninguna está elegida, se preselecciona para que el pago siempre descuente de una cuenta.
  const hasChoice = options.some((a) => a.id === accountId);
  useEffect(() => {
    if (options.length > 0 && !hasChoice) onAccount(defaultAccountFor(method, accounts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length, hasChoice, method]);
  function pick(m: PaymentMethod) {
    onMethod(m);
    onAccount(defaultAccountFor(m, accounts));
  }
  return (
    <div className="flex flex-col gap-2.5">
      <MethodTiles value={method} onChange={pick} methods={methods} />
      {options.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold">{accountLabel}</span>
          {options.map((a) => {
            const on = accountId === a.id;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => onAccount(a.id)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-[14px] border-2 px-3 py-2.5 text-left text-sm transition-colors",
                  on ? "border-primary bg-primary/12" : "border-transparent bg-muted"
                )}
              >
                <span className="min-w-0 truncate font-semibold">{a.label}</span>
                {a.balanceCents != null && (
                  <span className={cn("shrink-0 text-xs tabular-nums", a.balanceCents <= 0 ? "font-bold text-destructive" : "text-muted-foreground")}>
                    Saldo {formatAccountMoney(a.currency, a.balanceCents)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
