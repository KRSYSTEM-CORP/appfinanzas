-- New companies default to USD as reference currency (audit KRPOS-FIS-002).
-- Existing companies keep whatever they chose.
ALTER TABLE "Company" ALTER COLUMN "referenceCurrency" SET DEFAULT 'USD';
