-- Nómina: empleados pagados por la empresa y sus pagos por quincena.
CREATE TABLE "PayrollEmployee" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nationalId" TEXT,
    "position" TEXT,
    "baseCents" INTEGER NOT NULL,
    "foodBonusCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollEmployee_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PayrollEmployee_companyId_active_idx" ON "PayrollEmployee"("companyId", "active");
ALTER TABLE "PayrollEmployee" ADD CONSTRAINT "PayrollEmployee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PayrollPayment" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "deductionsCents" INTEGER NOT NULL,
    "advanceCents" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "proofDataUrl" TEXT,
    "expenseId" TEXT,
    "paidById" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayrollPayment_employeeId_period_key" ON "PayrollPayment"("employeeId", "period");
CREATE INDEX "PayrollPayment_companyId_period_idx" ON "PayrollPayment"("companyId", "period");
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "PayrollEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PayrollEmployee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollEmployee" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PayrollEmployee"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

ALTER TABLE "PayrollPayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PayrollPayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PayrollPayment"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PayrollEmployee" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PayrollPayment" TO app_runtime;
  END IF;
END
$$;
