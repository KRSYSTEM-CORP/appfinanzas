-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "receiptControlNumber" INTEGER;

-- AlterTable
ALTER TABLE "SalePayment" ADD COLUMN     "amountCurrencyCents" INTEGER,
ADD COLUMN     "currencyCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_companyId_receiptControlNumber_key" ON "Sale"("companyId", "receiptControlNumber");
