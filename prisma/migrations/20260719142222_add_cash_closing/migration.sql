-- CreateTable
CREATE TABLE "CashClosing" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "closingDate" DATE NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "note" TEXT,
    "closedById" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CashClosing_companyId_closingDate_idx" ON "CashClosing"("companyId", "closingDate");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosing_companyId_closingDate_key" ON "CashClosing"("companyId", "closingDate");

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extends the Row-Level Security safety net (see add_rls_policies) to the
-- new CashClosing table. Same pattern: visible only to the matching company
-- (app.company_id) or the super admin escape hatch (app.is_super_admin).
ALTER TABLE "CashClosing" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashClosing" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashClosing"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );
