"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Segmented } from "@/components/ui/segmented";
import { ListRow, Note } from "@/components/shared/SectionCard";
import { Switch } from "@/components/settings/SettingsUi";
import { updateReferenceCurrencySettings } from "@/lib/actions/settings";
import type { ReferenceCurrency } from "@prisma/client";

// Moneda base (Dólares / Euros) e interruptor de la tasa de cambio. Cada cambio se guarda al tocarlo.
export function ReferenceCurrencyForm({
  currentEnabled,
  currentReferenceCurrency,
}: {
  currentEnabled: boolean;
  currentReferenceCurrency: ReferenceCurrency;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(currentEnabled);
  const [referenceCurrency, setReferenceCurrency] = useState<ReferenceCurrency>(currentReferenceCurrency);
  const [isPending, startTransition] = useTransition();

  function save(nextEnabled: boolean, nextRef: ReferenceCurrency) {
    const prev = { enabled, referenceCurrency };
    setEnabled(nextEnabled);
    setReferenceCurrency(nextRef);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("exchangeRateEnabled", String(nextEnabled));
      formData.set("referenceCurrency", nextRef);
      const result = await updateReferenceCurrencySettings(formData);
      if (result.success) {
        toast.success("Preferencias de moneda guardadas.");
        router.refresh();
      } else {
        setEnabled(prev.enabled);
        setReferenceCurrency(prev.referenceCurrency);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className={isPending ? "pointer-events-none opacity-70" : undefined}>
      <Segmented<ReferenceCurrency>
        label="Moneda base"
        value={referenceCurrency}
        onChange={(v) => save(enabled, v)}
        options={[
          { value: "USD", label: "Dólares ($)" },
          { value: "EUR", label: "Euros (€)" },
        ]}
      />
      {referenceCurrency === "EUR" && (
        <Note className="text-warning">
          Con referencia en EUR, los pagos en dólares (Zelle, Binance, PayPal o divisas) se cuentan 1 a 1 como euros, sin tasa EUR/USD. Si cobras en dólares, usa USD como referencia.
        </Note>
      )}
      <ListRow className="mt-3">
        <div>
          <b>Tasa de cambio</b>
          <small>
            {enabled
              ? "Tus precios se muestran en tu moneda local, convertidos con la tasa, junto al precio de referencia."
              : "Tus precios se muestran en una sola moneda (la base), sin conversión ni tasa de cambio."}
          </small>
        </div>
        <Switch on={enabled} onChange={(v) => save(v, referenceCurrency)} label="Tasa de cambio" />
      </ListRow>
    </div>
  );
}
