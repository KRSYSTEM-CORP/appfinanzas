import "server-only";

import { fetchBcvOfficial } from "@/lib/bcv-official";
import { isValueDateCurrent } from "@/lib/bcv-parse";

// Venezuela's official BCV (Banco Central de Venezuela) rate, via
// ve.dolarapi.com — a free public aggregator that republishes BCV's own
// daily-published rate (BCV itself has no public API). Used both by the
// manual "Actualizar con tasa BCV" button (lib/actions/settings.ts) and the
// daily cron job (app/api/cron/bcv-rate/route.ts) that refreshes every VES
// company automatically.
export async function fetchBcvRate(currency: "USD" | "EUR"): Promise<number> {
  return (await fetchBcvRateDetailed(currency)).rate;
}

export type BcvRateResult = { rate: number; source: "bcv" | "dolarapi"; valueDate: string | null };

// Primero la página oficial del BCV (publica la tasa del día siguiente por la
// tarde); si no se puede leer, o su fecha valor ya pasó, el agregador de siempre.
export async function fetchBcvRateDetailed(currency: "USD" | "EUR"): Promise<BcvRateResult> {
  try {
    const official = await fetchBcvOfficial();
    if (isValueDateCurrent(official.valueDate)) {
      return { rate: currency === "USD" ? official.usd : official.eur, source: "bcv", valueDate: official.valueDate };
    }
  } catch {
    // Cae al agregador.
  }
  return { rate: await fetchAggregatorRate(currency), source: "dolarapi", valueDate: null };
}

async function fetchAggregatorRate(currency: "USD" | "EUR"): Promise<number> {
  const path = currency === "USD" ? "dolares" : "euros";
  const res = await fetch(`https://ve.dolarapi.com/v1/${path}/oficial`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error("No se pudo consultar la tasa del BCV");
  }
  const json = await res.json();
  const rate = Number(json.promedio);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("La tasa del BCV recibida no es válida");
  }
  return rate;
}
