-- Los gastos pueden salir de una cuenta (descuentan su saldo) y las cuentas guardan el sitio web de su banco
-- (aditiva: las columnas son opcionales; los gastos anteriores quedan sin cuenta, como efectivo de caja).

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "paymentAccountId" TEXT,
ADD COLUMN     "paymentMethod" "PaymentMethod";

-- AlterTable
ALTER TABLE "PaymentAccount" ADD COLUMN     "websiteUrl" TEXT;

-- CreateIndex
CREATE INDEX "Expense_paymentAccountId_idx" ON "Expense"("paymentAccountId");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Inyecciones de fondos a una cuenta (suman a su saldo). Tabla nueva con aislamiento por empresa.
CREATE TABLE "AccountFunding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountFunding_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccountFunding_paymentAccountId_createdAt_idx" ON "AccountFunding"("paymentAccountId", "createdAt");
CREATE INDEX "AccountFunding_companyId_idx" ON "AccountFunding"("companyId");
ALTER TABLE "AccountFunding" ADD CONSTRAINT "AccountFunding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountFunding" ADD CONSTRAINT "AccountFunding_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountFunding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AccountFunding" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AccountFunding"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AccountFunding" TO app_runtime;
  END IF;
END
$$;
