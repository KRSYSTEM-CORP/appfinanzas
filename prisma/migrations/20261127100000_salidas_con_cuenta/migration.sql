-- Salidas de Caja Chica y devoluciones por anulación con origen del dinero (método, cuenta, moneda, tasa).
-- Aditiva: columnas opcionales; una venta puede tener varias devoluciones (el índice único de saleId pasa a normal).
ALTER TABLE "CashOutflow" ADD COLUMN "paymentMethod" "PaymentMethod";
ALTER TABLE "CashOutflow" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "CashOutflow" ADD COLUMN "currencyCode" TEXT;
ALTER TABLE "CashOutflow" ADD COLUMN "amountCurrencyCents" INTEGER;
ALTER TABLE "CashOutflow" ADD COLUMN "exchangeRate" DECIMAL(12,4);
ALTER TABLE "CashOutflow" ADD COLUMN "requestKey" TEXT;

DROP INDEX "CashOutflow_saleId_key";
CREATE INDEX "CashOutflow_saleId_idx" ON "CashOutflow"("saleId");
CREATE INDEX "CashOutflow_paymentAccountId_idx" ON "CashOutflow"("paymentAccountId");
CREATE UNIQUE INDEX "CashOutflow_companyId_requestKey_key" ON "CashOutflow"("companyId", "requestKey");

ALTER TABLE "CashOutflow" ADD CONSTRAINT "CashOutflow_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
