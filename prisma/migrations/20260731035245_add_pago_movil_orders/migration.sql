-- CreateEnum
CREATE TYPE "PagoMovilOrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED');

-- CreateTable
CREATE TABLE "PagoMovilOrder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amountUsdCents" INTEGER NOT NULL,
    "exchangeRate" DECIMAL(12,4) NOT NULL,
    "expectedAmountBsCents" INTEGER NOT NULL,
    "status" "PagoMovilOrderStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PagoMovilOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagoMovilOrder_companyId_status_idx" ON "PagoMovilOrder"("companyId", "status");

-- CreateIndex
CREATE INDEX "PagoMovilOrder_expectedAmountBsCents_status_idx" ON "PagoMovilOrder"("expectedAmountBsCents", "status");

-- AddForeignKey
ALTER TABLE "PagoMovilOrder" ADD CONSTRAINT "PagoMovilOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
