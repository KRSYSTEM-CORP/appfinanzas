-- Solicitudes de compra de créditos del Asistente IA (aprobación manual).
CREATE TABLE "AiCreditRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCreditRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AiCreditRequest_companyId_createdAt_idx" ON "AiCreditRequest"("companyId", "createdAt");
CREATE INDEX "AiCreditRequest_status_createdAt_idx" ON "AiCreditRequest"("status", "createdAt");
ALTER TABLE "AiCreditRequest" ADD CONSTRAINT "AiCreditRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiCreditRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AiCreditRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AiCreditRequest"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AiCreditRequest" TO app_runtime;
  END IF;
END
$$;
