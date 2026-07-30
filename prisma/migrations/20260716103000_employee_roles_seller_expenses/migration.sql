-- CreateEnum
CREATE TYPE "Role" AS ENUM ('GERENTE', 'VENDEDOR');

-- AlterTable: Company.loginCode added nullable first, backfilled from the
-- existing (already-unique) id so no two companies can collide, then
-- tightened to NOT NULL + UNIQUE. A plain default isn't possible here since
-- the value must be unique per row.
ALTER TABLE "Company" ADD COLUMN     "loginCode" TEXT;
UPDATE "Company" SET "loginCode" = upper(right("id", 6));
ALTER TABLE "Company" ALTER COLUMN "loginCode" SET NOT NULL;
CREATE UNIQUE INDEX "Company_loginCode_key" ON "Company"("loginCode");

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "sellerName" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "sellerName" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'GERENTE';

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "amountCents" INTEGER NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_companyId_spentAt_idx" ON "Expense"("companyId", "spentAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_companyId_firstName_lastName_key" ON "User"("companyId", "firstName", "lastName");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-Level Security for the new tenant-scoped Expense table, same pattern
-- as prisma/migrations/20260715054500_add_rls_policies.
ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Expense"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );
