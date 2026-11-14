"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACCOUNT_KIND_LABELS,
  ACCOUNT_NUMBER_LABELS,
  accountClipboardText,
  bankLogoSrc,
  defaultBankKey,
} from "@/lib/payment-accounts";
import type { PaymentAccountRow } from "@/lib/actions/payment-accounts";

// Muestra las cuentas de cobro con su logo, para que el vendedor se las dé al
// cliente (botón para copiar el texto completo).
export function PaymentAccountsList({
  accounts,
  actions,
}: {
  accounts: PaymentAccountRow[];
  actions?: (a: PaymentAccountRow) => React.ReactNode;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(a: PaymentAccountRow) {
    try {
      await navigator.clipboard.writeText(accountClipboardText(a));
      setCopied(a.id);
      setTimeout(() => setCopied((c) => (c === a.id ? null : c)), 1800);
    } catch {
      // Sin permiso de portapapeles: el texto sigue visible en pantalla.
    }
  }

  return (
    <ul className="flex flex-col gap-2">
      {accounts.map((a) => {
        const logo = bankLogoSrc(a.bankKey ?? defaultBankKey(a.kind));
        return (
          <li
            key={a.id}
            className={`flex flex-wrap items-center gap-3 rounded-[14px] border bg-card p-2.5 ${a.active ? "" : "opacity-60"}`}
          >
            <span className="inline-flex h-[46px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] bg-white px-2 py-1.5 shadow-[inset_0_0_0_1px_rgba(20,22,31,.1)]">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={a.bankName ?? ACCOUNT_KIND_LABELS[a.kind]} className="size-full object-contain" />
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">{ACCOUNT_KIND_LABELS[a.kind].slice(0, 2)}</span>
              )}
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                {ACCOUNT_KIND_LABELS[a.kind]}
                {a.bankName ? ` · ${a.bankName}` : ""}
                {!a.active && <span className="ml-2 text-xs text-muted-foreground">(oculta)</span>}
              </p>
              <p className="break-all text-muted-foreground">
                {ACCOUNT_NUMBER_LABELS[a.kind]}: <span className="font-medium text-foreground">{a.accountNumber}</span>
                {a.docId ? ` · ${a.docId}` : ""}
              </p>
              {a.holder && <p className="text-xs text-muted-foreground">Titular: {a.holder}</p>}
              {a.note && <p className="text-xs text-muted-foreground">{a.note}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={() => copy(a)} aria-label="Copiar datos de la cuenta">
                {copied === a.id ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                {copied === a.id ? "Copiado" : "Copiar"}
              </Button>
              {actions?.(a)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
