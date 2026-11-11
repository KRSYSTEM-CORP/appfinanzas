-- Conteo físico al cerrar caja y apertura por método (aditiva).
ALTER TABLE "CashClosing" ADD COLUMN "countedUsdCents" INTEGER, ADD COLUMN "countedBsCents" INTEGER, ADD COLUMN "expectedCashCents" INTEGER, ADD COLUMN "differenceCents" INTEGER;
ALTER TABLE "CashOpening" ADD COLUMN "openingBsCents" INTEGER, ADD COLUMN "openingUsdCents" INTEGER;
