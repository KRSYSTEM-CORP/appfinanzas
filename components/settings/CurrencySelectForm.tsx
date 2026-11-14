"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { Note } from "@/components/shared/SectionCard";
import { updateLocalCurrency } from "@/lib/actions/settings";
import { CURRENCIES } from "@/lib/currencies";
import type { ReferenceCurrency } from "@prisma/client";

// Moneda local del país: se guarda al elegirla.
export function CurrencySelectForm({
  currentCurrencyCode,
  referenceCurrency,
}: {
  currentCurrencyCode: string;
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [currencyCode, setCurrencyCode] = useState(currentCurrencyCode);
  const [isPending, startTransition] = useTransition();

  function change(code: string) {
    const prev = currencyCode;
    setCurrencyCode(code);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("localCurrencyCode", code);
      const result = await updateLocalCurrency(formData);
      if (result.success) {
        toast.success("Moneda guardada.");
        router.refresh();
      } else {
        setCurrencyCode(prev);
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <Field label="Moneda local de tu país">
        <select value={currencyCode} disabled={isPending} onChange={(e) => change(e.target.value)} className={FIELD_CONTROL}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.symbol})
            </option>
          ))}
        </select>
      </Field>
      <Note>Los precios se guardan en {referenceCurrency} y se muestran convertidos a esta moneda con tu tasa.</Note>
    </>
  );
}
