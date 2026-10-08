-- Allows an offline sale to be retried safely after a dropped response.
-- Null remains valid for ordinary online checkouts.
ALTER TABLE "Sale" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Sale_companyId_idempotencyKey_key"
  ON "Sale"("companyId", "idempotencyKey");
