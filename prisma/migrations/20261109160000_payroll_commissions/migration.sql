-- Comisiones de nómina: % sobre las ventas de la persona en la quincena.
ALTER TABLE "PayrollEmployee" ADD COLUMN "commissionPct" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "PayrollEmployee" ADD COLUMN "userId" TEXT;
ALTER TABLE "PayrollPayment" ADD COLUMN "commissionCents" INTEGER NOT NULL DEFAULT 0;
