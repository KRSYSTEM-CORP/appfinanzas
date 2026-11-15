-- Compras y nómina descuentan de la cuenta de origen; la nómina admite pagos parciales,
-- adelantos y fecha elegida (aditiva; los pagos anteriores quedan como pagados por completo).

-- DropIndex
DROP INDEX "PayrollPayment_employeeId_period_key";

-- AlterTable
ALTER TABLE "PurchasePayment" ADD COLUMN     "paymentAccountId" TEXT;

-- AlterTable
ALTER TABLE "PayrollPayment" ADD COLUMN     "accountDebitCents" INTEGER,
ADD COLUMN     "isAdvance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "paidCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "paymentAccountId" TEXT;

-- CreateIndex
CREATE INDEX "PurchasePayment_paymentAccountId_idx" ON "PurchasePayment"("paymentAccountId");

-- CreateIndex
CREATE INDEX "PayrollPayment_employeeId_period_idx" ON "PayrollPayment"("employeeId", "period");

-- CreateIndex
CREATE INDEX "PayrollPayment_paymentAccountId_idx" ON "PayrollPayment"("paymentAccountId");

-- AddForeignKey
ALTER TABLE "PurchasePayment" ADD CONSTRAINT "PurchasePayment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Los pagos de nómina existentes se pagaron completos.
UPDATE "PayrollPayment" SET "paidCents" = "netCents";
