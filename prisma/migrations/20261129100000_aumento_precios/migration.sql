-- Aumento porcentual de precios con deshacer (aditiva).
CREATE TABLE "PriceAdjustment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "percentBp" INTEGER NOT NULL,
    "rounding" TEXT NOT NULL,
    "scopeCategory" TEXT,
    "productCount" INTEGER NOT NULL,
    "items" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),
    "undoneByName" TEXT,
    CONSTRAINT "PriceAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PriceAdjustment_companyId_createdAt_idx" ON "PriceAdjustment"("companyId", "createdAt");
ALTER TABLE "PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PriceAdjustment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PriceAdjustment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PriceAdjustment"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PriceAdjustment" TO app_runtime;
  END IF;
END
$$;
