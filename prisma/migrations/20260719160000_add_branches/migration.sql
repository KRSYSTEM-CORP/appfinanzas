-- Multi-sucursal: each company can now have more than one Branch, each with
-- its own independent product catalog and cash register. Every EXISTING
-- company gets exactly one auto-created "Sucursal Principal" branch here,
-- and every existing Product/Sale/Quote/CashClosing/VENDEDOR-role User is
-- backfilled onto it — so no company in production loses access to its own
-- data or notices any behavior change unless it deliberately creates a
-- second branch.

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Branch_companyId_name_key" ON "Branch"("companyId", "name");
CREATE INDEX "Branch_companyId_idx" ON "Branch"("companyId");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same tenant_isolation RLS pattern as every other per-company table (see
-- add_rls_policies) — this is standard precedent for a new companyId-scoped
-- table, NOT the same thing as adding branch-level RLS to existing tables
-- (deliberately deferred, see the plan doc).
ALTER TABLE "Branch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Branch"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

-- Backfill: one default branch per existing company.
INSERT INTO "Branch" ("id", "companyId", "name", "isActive", "createdAt")
SELECT gen_random_uuid()::text, "id", 'Sucursal Principal', true, now()
FROM "Company";

-- AlterTable: add branchId columns (nullable for now, populated below).
ALTER TABLE "Product" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Quote" ADD COLUMN "branchId" TEXT;
ALTER TABLE "CashClosing" ADD COLUMN "branchId" TEXT;
ALTER TABLE "User" ADD COLUMN "branchId" TEXT;

-- Backfill every existing row onto its company's new default branch.
UPDATE "Product" p SET "branchId" = b."id"
FROM "Branch" b WHERE b."companyId" = p."companyId" AND b."name" = 'Sucursal Principal';

UPDATE "Sale" s SET "branchId" = b."id"
FROM "Branch" b WHERE b."companyId" = s."companyId" AND b."name" = 'Sucursal Principal';

UPDATE "Quote" q SET "branchId" = b."id"
FROM "Branch" b WHERE b."companyId" = q."companyId" AND b."name" = 'Sucursal Principal';

UPDATE "CashClosing" c SET "branchId" = b."id"
FROM "Branch" b WHERE b."companyId" = c."companyId" AND b."name" = 'Sucursal Principal';

-- Only VENDEDOR employees get pinned to a branch — GERENTE/the owner account
-- keeps branchId NULL, meaning "every branch" (see switchBranch()).
UPDATE "User" u SET "branchId" = b."id"
FROM "Branch" b WHERE b."companyId" = u."companyId" AND b."name" = 'Sucursal Principal' AND u."role" = 'VENDEDOR';

-- Now that every row has a value, make it required where the model says so.
ALTER TABLE "Product" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Sale" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "Quote" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "CashClosing" ALTER COLUMN "branchId" SET NOT NULL;

ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Swap the old per-company unique sequences for per-branch ones (each
-- branch's register numbers its own documents independently, like a
-- physically separate cash register would).
DROP INDEX "Product_companyId_sku_key";
CREATE UNIQUE INDEX "Product_branchId_sku_key" ON "Product"("branchId", "sku");

DROP INDEX "Sale_companyId_controlNumber_key";
CREATE UNIQUE INDEX "Sale_branchId_controlNumber_key" ON "Sale"("branchId", "controlNumber");

DROP INDEX "Sale_companyId_receiptControlNumber_key";
CREATE UNIQUE INDEX "Sale_branchId_receiptControlNumber_key" ON "Sale"("branchId", "receiptControlNumber");

DROP INDEX "Sale_companyId_invoiceNumber_key";
CREATE UNIQUE INDEX "Sale_branchId_invoiceNumber_key" ON "Sale"("branchId", "invoiceNumber");

DROP INDEX "Quote_companyId_controlNumber_key";
CREATE UNIQUE INDEX "Quote_branchId_controlNumber_key" ON "Quote"("branchId", "controlNumber");

DROP INDEX "CashClosing_companyId_closingDate_key";
CREATE UNIQUE INDEX "CashClosing_branchId_closingDate_key" ON "CashClosing"("branchId", "closingDate");

-- Supporting (non-unique) indexes for the new branch-scoped query patterns.
CREATE INDEX "Product_branchId_isActive_idx" ON "Product"("branchId", "isActive");
CREATE INDEX "Sale_branchId_createdAt_idx" ON "Sale"("branchId", "createdAt");
CREATE INDEX "Quote_branchId_createdAt_idx" ON "Quote"("branchId", "createdAt");
CREATE INDEX "User_branchId_idx" ON "User"("branchId");
