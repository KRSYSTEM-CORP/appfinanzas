-- Cada cobro de una venta guarda en qué cuenta se recibió (aditiva: la columna es opcional; los cobros anteriores
-- siguen contando por el método vinculado de la cuenta).

-- AlterTable
ALTER TABLE "SalePayment" ADD COLUMN     "paymentAccountId" TEXT;

-- CreateIndex
CREATE INDEX "SalePayment_paymentAccountId_idx" ON "SalePayment"("paymentAccountId");

-- AddForeignKey
ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
