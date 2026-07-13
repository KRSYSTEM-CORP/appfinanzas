-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "logoDataUrl" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "customerAddress" TEXT,
ADD COLUMN     "customerFirstName" TEXT,
ADD COLUMN     "customerLastName" TEXT,
ADD COLUMN     "customerPhone" TEXT;

-- CreateIndex
CREATE INDEX "Product_companyId_category_idx" ON "Product"("companyId", "category");

