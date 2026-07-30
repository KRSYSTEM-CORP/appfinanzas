-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('GENERAL', 'REDUCED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "PurchasePaymentStatus" AS ENUM ('PAID', 'PENDING');

-- AlterTable: Company IVA configuration
ALTER TABLE "Company"
  ADD COLUMN "ivaGeneralRatePercent" INTEGER NOT NULL DEFAULT 16,
  ADD COLUMN "ivaReducedRatePercent" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "isIvaWithholdingAgent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ivaWithholdingPercent" INTEGER NOT NULL DEFAULT 75;

-- AlterTable: Product tax category
ALTER TABLE "Product" ADD COLUMN "taxCategory" "TaxCategory" NOT NULL DEFAULT 'GENERAL';

-- AlterTable: Customer RIF
ALTER TABLE "Customer" ADD COLUMN "rif" TEXT;

-- AlterTable: Sale tax breakdown + customer RIF snapshot
ALTER TABLE "Sale"
  ADD COLUMN "baseImponibleCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "customerRif" TEXT;

-- AlterTable: SaleItem tax breakdown snapshot
ALTER TABLE "SaleItem"
  ADD COLUMN "taxCategory" "TaxCategory" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "taxRatePercent" INTEGER NOT NULL DEFAULT 16,
  ADD COLUMN "baseCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rif" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "controlNumber" INTEGER,
    "supplierInvoiceNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCents" INTEGER NOT NULL,
    "baseImponibleCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "ivaRetainedCents" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PurchasePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseItem" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "taxCategory" "TaxCategory" NOT NULL DEFAULT 'GENERAL',
    "taxRatePercent" INTEGER NOT NULL DEFAULT 16,
    "unitCostCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "subtotalCents" INTEGER NOT NULL,

    CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_branchId_controlNumber_key" ON "Purchase"("branchId", "controlNumber");

-- CreateIndex
CREATE INDEX "Purchase_companyId_createdAt_idx" ON "Purchase"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_branchId_createdAt_idx" ON "Purchase"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "PurchaseItem_productId_idx" ON "PurchaseItem"("productId");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Extend the Row-Level Security safety net (see add_rls_policies) to the new
-- tables. Same pattern as every other tenant-scoped table: visible only to
-- the matching company (app.company_id) or the super admin escape hatch.
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Supplier"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

ALTER TABLE "Purchase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Purchase" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Purchase"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

-- PurchaseItem has no companyId of its own — scope it through its parent
-- Purchase row instead, same as SaleItem/QuoteItem.
ALTER TABLE "PurchaseItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchaseItem"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Purchase"
      WHERE "Purchase"."id" = "PurchaseItem"."purchaseId"
        AND "Purchase"."companyId" = current_setting('app.company_id', true)
    )
  );
