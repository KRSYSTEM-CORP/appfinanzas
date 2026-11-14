-- Segmentación de promociones y canje de cupón en el POS (aditiva; las tablas ya tienen RLS y GRANT).
ALTER TABLE "Promotion" ADD COLUMN "rangeFrom" TEXT;
ALTER TABLE "Promotion" ADD COLUMN "rangeTo" TEXT;
ALTER TABLE "Promotion" ADD COLUMN "customerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "PromotionRedemption" ADD COLUMN "saleId" TEXT;
CREATE UNIQUE INDEX "PromotionRedemption_promotionId_customerId_key" ON "PromotionRedemption"("promotionId", "customerId");
