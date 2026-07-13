-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "exchangeRate" DECIMAL(12,4),
ADD COLUMN     "exchangeRateUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "exchangeRate" DECIMAL(12,4);

