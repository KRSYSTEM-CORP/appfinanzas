ALTER TABLE "Product" ADD COLUMN     "trackStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "priceTiersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wholesalePriceCents" INTEGER,
ADD COLUMN     "wholesaleMinQty" INTEGER,
ADD COLUMN     "bulkPriceCents" INTEGER,
ADD COLUMN     "bulkMinQty" INTEGER;
