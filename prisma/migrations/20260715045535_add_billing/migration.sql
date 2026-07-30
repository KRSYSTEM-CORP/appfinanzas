-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "billingExchangeRate" DECIMAL(12,4),
ADD COLUMN     "isExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlyFeeEurCents" INTEGER,
ADD COLUMN     "nextPaymentDueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "amountEurCents" INTEGER NOT NULL,
    "exchangeRate" DECIMAL(12,4) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "verifiedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_companyId_createdAt_idx" ON "Payment"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

