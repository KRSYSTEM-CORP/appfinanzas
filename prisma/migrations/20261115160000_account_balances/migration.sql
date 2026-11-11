-- Saldo y vínculo método -> cuenta (aditiva).
ALTER TABLE "PaymentAccount" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "openingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "linkedMethod" "PaymentMethod",
ADD COLUMN "balanceSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
