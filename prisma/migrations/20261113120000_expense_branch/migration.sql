-- Gasto asignado a una sucursal (aditiva, opcional; los gastos anteriores quedan sin sede).
ALTER TABLE "Expense" ADD COLUMN "branchId" TEXT;
CREATE INDEX "Expense_companyId_branchId_idx" ON "Expense"("companyId", "branchId");
