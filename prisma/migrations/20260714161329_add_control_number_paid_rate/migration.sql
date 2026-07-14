-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "controlNumber" INTEGER,
ADD COLUMN     "paidExchangeRate" DECIMAL(12,4),
ALTER COLUMN "paymentMethod" DROP NOT NULL,
ALTER COLUMN "paymentMethod" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_companyId_controlNumber_key" ON "Sale"("companyId", "controlNumber");

