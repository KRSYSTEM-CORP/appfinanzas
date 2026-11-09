import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withSuperAdmin } from "@/lib/tenant-db";
import { fetchBcvRateDetailed } from "@/lib/bcv-rate";
import { PLATFORM_SETTINGS_ID } from "@/lib/billing";
import { invalidateCache } from "@/lib/cache";

// Runs once a day at 7:00 p. m. Venezuela time (23:00 UTC — Vercel cron schedules
// always run in UTC, see vercel.json's "crons" entry), when the BCV has already
// published the next business day's rate, so it is applied in advance. The
// midnight re-check happens on demand: any rate older than the current "rate
// day" (lib/bcv-parse.ts, flips at 7 p. m.) is renewed on the next page load.
// (Before: ran at 00:00 Venezuela time, 04:00 UTC) and refreshes
// Company.exchangeRate for every VES company automatically — this is what
// makes the BCV rate "just update itself" instead of requiring someone to
// open Settings and click a button every morning. Also refreshes
// PlatformSettings.platformExchangeRate the same way — KR System's own
// USD/Bs rate for pricing the subscription's Pago Móvil amount (see
// getPlatformExchangeRateInfo, lib/actions/billing.ts), independent of any
// one company's own rate above. Vercel signs its own cron requests with
// `Authorization: Bearer $CRON_SECRET` once that env var is set on the
// project, which is what's checked below.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [usdRate, eurRate] = await Promise.allSettled([fetchBcvRateDetailed("USD"), fetchBcvRateDetailed("EUR")]);

  const results = await withSuperAdmin(async (tx) => {
    const companies = await tx.company.findMany({
      where: { localCurrencyCode: "VES", exchangeRateEnabled: true },
      select: { id: true, referenceCurrency: true },
    });

    let updated = 0;
    let skipped = 0;
    for (const company of companies) {
      const rateResult = company.referenceCurrency === "USD" ? usdRate : eurRate;
      if (rateResult.status !== "fulfilled") {
        skipped++;
        continue;
      }
      await tx.company.update({
        where: { id: company.id },
        data: { exchangeRate: rateResult.value.rate, exchangeRateUpdatedAt: new Date() },
      });
      updated++;
    }
    return { total: companies.length, updated, skipped };
  });

  let platformRateUpdated = false;
  if (usdRate.status === "fulfilled") {
    await prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, platformExchangeRate: usdRate.value.rate, platformExchangeRateUpdatedAt: new Date() },
      update: { platformExchangeRate: usdRate.value.rate, platformExchangeRateUpdatedAt: new Date() },
    });
    await invalidateCache("platformExchangeRateInfo");
    platformRateUpdated = true;
  }

  return NextResponse.json({
    ok: true,
    usdRate: usdRate.status === "fulfilled" ? usdRate.value.rate : null,
    eurRate: eurRate.status === "fulfilled" ? eurRate.value.rate : null,
    source: usdRate.status === "fulfilled" ? usdRate.value.source : null,
    valueDate: usdRate.status === "fulfilled" ? usdRate.value.valueDate : null,
    platformRateUpdated,
    ...results,
  });
}
