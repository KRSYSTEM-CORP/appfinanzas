import { NextResponse, type NextRequest } from "next/server";
import { withSuperAdmin } from "@/lib/tenant-db";
import { fetchBcvRate } from "@/lib/bcv-rate";
import { prisma } from "@/lib/prisma";
import { PLATFORM_SETTINGS_ID } from "@/lib/billing";

// Runs once a day (see vercel.json's "crons" entry) and refreshes
// Company.exchangeRate for every VES company automatically — this is what
// makes the BCV rate "just update itself" instead of requiring someone to
// open Settings and click a button every morning. Also refreshes
// PlatformSettings.billingExchangeRate, the separate platform-wide USD/VES
// rate used to price each company's subscription in /billing — subscriptions
// are always USD, so it always takes the USD leg. Vercel signs its own cron
// requests with `Authorization: Bearer $CRON_SECRET` once that env var is
// set on the project, which is what's checked below.
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [usdRate, eurRate] = await Promise.allSettled([fetchBcvRate("USD"), fetchBcvRate("EUR")]);

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
        data: { exchangeRate: rateResult.value, exchangeRateUpdatedAt: new Date() },
      });
      updated++;
    }
    return { total: companies.length, updated, skipped };
  });

  let platformUpdated = false;
  if (usdRate.status === "fulfilled") {
    await prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, billingExchangeRate: usdRate.value },
      update: { billingExchangeRate: usdRate.value },
    });
    platformUpdated = true;
  }

  return NextResponse.json({
    ok: true,
    usdRate: usdRate.status === "fulfilled" ? usdRate.value : null,
    eurRate: eurRate.status === "fulfilled" ? eurRate.value : null,
    platformUpdated,
    ...results,
  });
}
