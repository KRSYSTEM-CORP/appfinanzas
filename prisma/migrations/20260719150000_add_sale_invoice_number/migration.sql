-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "invoiceNumber" INTEGER;

-- CreateIndex
-- Safe even with many existing NULL invoiceNumber rows: Postgres treats
-- every NULL as distinct for uniqueness purposes, so this never conflicts
-- with existing data (only two non-null rows for the same company would).
CREATE UNIQUE INDEX "Sale_companyId_invoiceNumber_key" ON "Sale"("companyId", "invoiceNumber");
