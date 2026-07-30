-- CreateEnum
CREATE TYPE "BinancePayOrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "BinancePayOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "merchantTradeNo" TEXT NOT NULL,
    "prepayId" TEXT,
    "amountUsdCents" INTEGER NOT NULL,
    "status" "BinancePayOrderStatus" NOT NULL DEFAULT 'PENDING',
    "checkoutUrl" TEXT,
    "qrcodeLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "BinancePayOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BinancePayOrder_merchantTradeNo_key" ON "BinancePayOrder"("merchantTradeNo");

-- CreateIndex
CREATE INDEX "BinancePayOrder_companyId_status_idx" ON "BinancePayOrder"("companyId", "status");

-- AddForeignKey
ALTER TABLE "BinancePayOrder" ADD CONSTRAINT "BinancePayOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extends the Row-Level Security safety net (see add_rls_policies) to the
-- new BinancePayOrder table. Same pattern: visible only to the matching
-- company (app.company_id) or the super admin escape hatch
-- (app.is_super_admin) — the webhook route uses withSuperAdmin() since it
-- has no company session, only a Binance-signed payload.
ALTER TABLE "BinancePayOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BinancePayOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BinancePayOrder"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );
