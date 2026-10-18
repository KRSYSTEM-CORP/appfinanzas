-- IGTF on foreign-currency payments (audit KRPOS-FIS-001). Off by default.
ALTER TABLE "Company" ADD COLUMN "isIgtfAgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Company" ADD COLUMN "igtfRatePercent" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Sale" ADD COLUMN "igtfCents" INTEGER NOT NULL DEFAULT 0;
