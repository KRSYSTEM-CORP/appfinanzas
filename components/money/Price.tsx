import { DEFAULT_CURRENCY_CODE, eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import type { ReferenceCurrency } from "@prisma/client";

export function Price({
  eurCents,
  rate,
  currencyCode = DEFAULT_CURRENCY_CODE,
  exchangeRateEnabled = true,
  referenceCurrency = "EUR",
  size = "sm",
  className,
}: {
  eurCents: number;
  rate: number | null;
  currencyCode?: string;
  exchangeRateEnabled?: boolean;
  referenceCurrency?: ReferenceCurrency;
  size?: "sm" | "lg";
  className?: string;
}) {
  const referenceLabel = formatCurrencyCents(referenceCurrency, eurCents);

  if (!exchangeRateEnabled) {
    return (
      <span className={`inline-flex flex-col ${className ?? ""}`}>
        <span className={`font-mono tabular-nums ${size === "lg" ? "text-lg font-semibold" : "font-medium"}`}>
          {referenceLabel}
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex flex-col ${className ?? ""}`}>
      <span className={`font-mono tabular-nums ${size === "lg" ? "text-lg font-semibold" : "font-medium"}`}>
        {rate != null ? formatLocalCurrency(eurCentsToLocal(eurCents, rate), currencyCode) : "—"}
      </span>
      <span className="font-mono tabular-nums text-xs text-muted-foreground">{referenceLabel}</span>
    </span>
  );
}
