import { ExchangeRateForm } from "@/components/settings/ExchangeRateForm";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { formatDate, formatVES } from "@/lib/format";
import { SHOP_TIME_ZONE, zonedDateParts } from "@/lib/report-types";

export const dynamic = "force-dynamic";

function isStale(updatedAt: Date | null): boolean {
  if (!updatedAt) return true;
  const today = zonedDateParts(new Date(), SHOP_TIME_ZONE);
  const updated = zonedDateParts(updatedAt, SHOP_TIME_ZONE);
  return !(
    today.year === updated.year &&
    today.month === updated.month &&
    today.day === updated.day
  );
}

export default async function SettingsPage() {
  const { rate, updatedAt } = await getExchangeRateInfo();
  const stale = isStale(updatedAt);

  return (
    <div className="flex flex-col gap-4 p-6 max-w-sm">
      <h1 className="text-2xl font-semibold">Tasa de cambio</h1>

      <div className="rounded-lg border p-4 flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Tasa actual</span>
        <span className="text-2xl font-semibold">
          {rate != null ? formatVES(rate) : "No configurada"}
          {rate != null && <span className="text-sm text-muted-foreground font-normal"> / €1</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {updatedAt ? `Última actualización: ${formatDate(updatedAt)}` : "Nunca se ha configurado"}
        </span>
      </div>

      {stale && (
        <p className="text-sm text-destructive">
          {rate != null
            ? "No has actualizado la tasa hoy. Los precios en bolívares pueden estar desactualizados."
            : "Configura una tasa para poder ver precios en bolívares y completar ventas."}
        </p>
      )}

      <ExchangeRateForm currentRate={rate} />
    </div>
  );
}
