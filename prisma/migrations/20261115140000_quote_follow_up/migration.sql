-- Vigencia, recordatorio y seguimiento de presupuestos (aditiva).
ALTER TABLE "Quote" ADD COLUMN "validUntil" TIMESTAMP(3), ADD COLUMN "remindAt" TIMESTAMP(3);

CREATE TABLE "QuoteFollowUp" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT,
    "createdById" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteFollowUp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuoteFollowUp_quoteId_createdAt_idx" ON "QuoteFollowUp"("quoteId", "createdAt");
CREATE INDEX "QuoteFollowUp_companyId_idx" ON "QuoteFollowUp"("companyId");
ALTER TABLE "QuoteFollowUp" ADD CONSTRAINT "QuoteFollowUp_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteFollowUp" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuoteFollowUp" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QuoteFollowUp"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "QuoteFollowUp" TO app_runtime;
  END IF;
END
$$;
