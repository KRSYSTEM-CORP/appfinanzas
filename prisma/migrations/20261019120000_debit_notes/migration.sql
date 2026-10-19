-- Notas de débito.
-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "nextDebitNoteNumber" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DebitNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "controlNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "baseImponibleCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebitNote_companyId_createdAt_idx" ON "DebitNote"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "DebitNote_saleId_idx" ON "DebitNote"("saleId");

-- CreateIndex
CREATE UNIQUE INDEX "DebitNote_branchId_controlNumber_key" ON "DebitNote"("branchId", "controlNumber");

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebitNote" ADD CONSTRAINT "DebitNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "DebitNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DebitNote" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DebitNote"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "DebitNote" TO app_runtime;
  END IF;
END $$;
