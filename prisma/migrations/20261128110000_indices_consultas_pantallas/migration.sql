-- Índices para las consultas de las pantallas de estadísticas y contabilidad. Aditiva: solo índices.
-- Cobros por fecha de cobro (se filtran por createdAt y se unen a la venta).
CREATE INDEX IF NOT EXISTS "SalePayment_createdAt_idx" ON "SalePayment"("createdAt");
-- Compras por pagar de la empresa.
CREATE INDEX IF NOT EXISTS "Purchase_companyId_paymentStatus_idx" ON "Purchase"("companyId", "paymentStatus");
