"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateLocalCurrency } from "@/lib/actions/settings";
import { CURRENCIES, getCurrency } from "@/lib/currencies";
import type { ReferenceCurrency } from "@prisma/client";

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.set("localCurrencyCode", currencyCode);
      const result = await updateLocalCurrency(formData);
      if (result.success) {
        toast.success("Moneda guardada.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-sm">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currency">Moneda local de tu país</Label>
        <Select value={currencyCode} onValueChange={(v) => v && setCurrencyCode(v)}>
          <SelectTrigger id="currency">
            <SelectValue placeholder="Selecciona una moneda">
              {(value: string | null) => (value ? getCurrency(value).name : "Selecciona una moneda")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name} ({c.symbol})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Los precios se guardan internamente en {referenceCurrency} y se muestran convertidos a
          esta moneda usando tu tasa de cambio.
        </p>
      </div>

      <Button type="submit" disabled={isPending || currencyCode === currentCurrencyCode}>
        {isPending ? "Guardando..." : "Guardar moneda"}
      </Button>
    </form>
  );
}
