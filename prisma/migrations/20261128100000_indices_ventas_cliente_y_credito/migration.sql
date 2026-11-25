-- Historial de ventas por cliente y estadisticas por cliente (customerId) y
-- cuentas por cobrar / total a credito (paymentStatus). Antes ambas lecturas
-- recorrian toda la tabla de ventas (EXPLAIN con 50 000 ventas: Seq Scan).
-- Aditiva: solo CREATE INDEX. Con cientos de miles de ventas tarda segundos y
-- bloquea las escrituras en "Sale" mientras se construye.
CREATE INDEX "Sale_companyId_customerId_idx" ON "Sale"("companyId", "customerId");
CREATE INDEX "Sale_companyId_paymentStatus_idx" ON "Sale"("companyId", "paymentStatus");
