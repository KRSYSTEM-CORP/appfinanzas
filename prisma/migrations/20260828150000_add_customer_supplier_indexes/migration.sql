CREATE INDEX "Customer_companyId_nextContactDate_idx" ON "Customer"("companyId", "nextContactDate");

CREATE INDEX "Supplier_companyId_isActive_idx" ON "Supplier"("companyId", "isActive");
