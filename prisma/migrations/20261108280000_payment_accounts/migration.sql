-- Datos para cobrar: varias cuentas de pago por empresa.
CREATE TYPE "PaymentAccountKind" AS ENUM ('PAGO_MOVIL', 'TRANSFER', 'ZELLE', 'BINANCE', 'PAYPAL');

CREATE TABLE "PaymentAccount" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "kind" "PaymentAccountKind" NOT NULL,
    "bankKey" TEXT,
    "bankName" TEXT,
    "holder" TEXT,
    "accountNumber" TEXT NOT NULL,
    "docId" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentAccount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PaymentAccount_companyId_active_idx" ON "PaymentAccount"("companyId", "active");
ALTER TABLE "PaymentAccount" ADD CONSTRAINT "PaymentAccount_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentAccount" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentAccount"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PaymentAccount" TO app_runtime;
  END IF;
END
$$;
