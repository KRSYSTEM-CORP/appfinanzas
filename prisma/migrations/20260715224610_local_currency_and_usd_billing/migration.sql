-- Company.localCurrencyCode: each company's retail-facing currency (ISO
-- 4217, see lib/currencies.ts). Defaults to VES for existing companies.
--
-- Company.monthlyFeeEurCents / Payment.amountEurCents /
-- PaymentReportLine.amountEurCents are dropped in favor of USD-denominated
-- equivalents — this is a currency redenomination, not a rename, so old EUR
-- amounts don't carry over automatically. Confirmed before applying: no
-- company had monthlyFeeEurCents set, and zero Payment/PaymentReportLine
-- rows existed yet, so nothing is actually lost.
ALTER TABLE "Company" DROP COLUMN "monthlyFeeEurCents",
ADD COLUMN     "localCurrencyCode" TEXT NOT NULL DEFAULT 'VES',
ADD COLUMN     "monthlyFeeUsdCents" INTEGER;

ALTER TABLE "Payment" DROP COLUMN "amountEurCents",
ADD COLUMN     "amountUsdCents" INTEGER NOT NULL;

ALTER TABLE "PaymentReportLine" DROP COLUMN "amountEurCents",
ADD COLUMN     "amountUsdCents" INTEGER NOT NULL;
