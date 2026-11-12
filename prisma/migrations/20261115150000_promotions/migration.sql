-- Promociones de Marketing y sus canjes (aditiva).
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "segment" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Promotion_companyId_code_key" ON "Promotion"("companyId", "code");
CREATE INDEX "Promotion_companyId_validUntil_idx" ON "Promotion"("companyId", "validUntil");
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PromotionRedemption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "customerId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromotionRedemption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PromotionRedemption_promotionId_idx" ON "PromotionRedemption"("promotionId");
CREATE INDEX "PromotionRedemption_companyId_idx" ON "PromotionRedemption"("companyId");
ALTER TABLE "PromotionRedemption" ADD CONSTRAINT "PromotionRedemption_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Promotion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Promotion" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Promotion"
  USING (current_setting('app.is_super_admin', true) = 'true' OR "companyId" = current_setting('app.company_id', true));
ALTER TABLE "PromotionRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromotionRedemption" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PromotionRedemption"
  USING (current_setting('app.is_super_admin', true) = 'true' OR "companyId" = current_setting('app.company_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "Promotion" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PromotionRedemption" TO app_runtime;
  END IF;
END
$$;
