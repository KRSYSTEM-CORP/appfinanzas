"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FIELD_CONTROL } from "@/components/shared/Field";
import { Note } from "@/components/shared/SectionCard";
import { updateExchangeRate } from "@/lib/actions/settings";
import { getCurrency } from "@/lib/currencies";
import type { ReferenceCurrency } from "@prisma/client";

// «Fijar tasa manualmente»: guarda la tasa escrita a mano. Para bolívares, el aviso dice cuándo
// se renueva sola con la del BCV.
export function ExchangeRateForm({
  currencyCode,
  referenceCurrency,
}: {
  currencyCode: string;
  referenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const isVes = currencyCode === "VES";
  const unit = isVes ? "Bs" : getCurrency(currencyCode).name.split(" (")[0];
  const refSymbol = referenceCurrency === "USD" ? "$1" : "€1";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const rate = Number(value.replace(",", "."));
    if (!(rate > 0)) {
      toast.error("Escribe una tasa válida");
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("rate", String(rate));
      const result = await updateExchangeRate(formData);
      if (result.success) {
        toast.success(`Tasa fija en ${isVes ? "Bs" : currencyCode} ${rate.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`);
        setValue("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit}>
      <Field label={`Fijar tasa manualmente (${unit} por ${refSymbol})`}>
        <input
          type="number"
          min={0}
          step="0.0001"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isVes ? "Se renueva sola con la del BCV" : "No cambiará hasta que la edites"}
          className={FIELD_CONTROL}
        />
      </Field>
      <Note>
        {isVes
          ? "Una tasa escrita a mano se usa hasta el próximo cambio de día de tasa (7:00 p. m.), cuando el sistema la renueva con la del BCV."
          : "Con una tasa manual, el sistema no la cambia hasta que vuelvas a editarla."}
      </Note>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isPending || value === ""}>
          {isPending ? "Guardando..." : "Guardar y activar"}
        </Button>
      </div>
    </form>
  );
}
