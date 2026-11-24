-- Devolución al anular una venta con efectivo cobrado: la salida de Caja Chica queda atada a la venta (aditiva: columna opcional).
ALTER TABLE "CashOutflow" ADD COLUMN     "saleId" TEXT;
CREATE UNIQUE INDEX "CashOutflow_saleId_key" ON "CashOutflow"("saleId");
ALTER TABLE "CashOutflow" ADD CONSTRAINT "CashOutflow_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
