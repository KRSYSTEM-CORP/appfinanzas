-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;
