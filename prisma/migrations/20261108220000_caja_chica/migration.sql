-- Caja Chica: apertura de caja y salidas de efectivo por sucursal y día.
CREATE TABLE "CashOpening" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "setById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashOpening_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashOpening_branchId_date_key" ON "CashOpening"("branchId", "date");
CREATE INDEX "CashOpening_companyId_date_idx" ON "CashOpening"("companyId", "date");
ALTER TABLE "CashOpening" ADD CONSTRAINT "CashOpening_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashOpening" ADD CONSTRAINT "CashOpening_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CashOutflow" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "concept" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CashOutflow_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CashOutflow_companyId_branchId_date_idx" ON "CashOutflow"("companyId", "branchId", "date");
ALTER TABLE "CashOutflow" ADD CONSTRAINT "CashOutflow_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashOutflow" ADD CONSTRAINT "CashOutflow_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashOpening" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashOpening" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashOpening"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

ALTER TABLE "CashOutflow" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashOutflow" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashOutflow"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CashOpening" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CashOutflow" TO app_runtime;
  END IF;
END
$$;
