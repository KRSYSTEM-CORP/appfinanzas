-- Notas de crédito (audit KRPOS-FIS-003).
-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "nextCreditNoteNumber" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "controlNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "baseImponibleCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "igtfCents" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_saleId_key" ON "CreditNote"("saleId");

-- CreateIndex
CREATE INDEX "CreditNote_companyId_createdAt_idx" ON "CreditNote"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_branchId_controlNumber_key" ON "CreditNote"("branchId", "controlNumber");

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "CreditNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CreditNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CreditNote"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

-- The app's runtime role (NOBYPASSRLS, see audit KRPOS-SEC-003) needs access
-- to the new table; skipped where that role doesn't exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CreditNote" TO app_runtime;
  END IF;
END $$;
