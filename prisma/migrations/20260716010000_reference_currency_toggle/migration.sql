-- Company.exchangeRateEnabled: lets a company turn off the dual-currency
-- conversion feature entirely (single-currency mode). Defaults to true so
-- every existing company keeps behaving exactly as it does today.
--
-- Company.referenceCurrency: the currency Product.priceCents/Sale.totalCents
-- etc. are canonically denominated in (EUR or USD — same stored cents value
-- either way, this app already treats them as 1:1 equivalent). Defaults to
-- EUR to preserve the meaning of every already-stored price.
CREATE TYPE "ReferenceCurrency" AS ENUM ('EUR', 'USD');

ALTER TABLE "Company" ADD COLUMN     "exchangeRateEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "referenceCurrency" "ReferenceCurrency" NOT NULL DEFAULT 'EUR';
