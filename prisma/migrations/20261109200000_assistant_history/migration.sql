-- Historial de conversaciones del Asistente IA.
CREATE TABLE "AssistantEntry" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "proposal" JSONB,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantEntry_companyId_userId_createdAt_idx" ON "AssistantEntry"("companyId", "userId", "createdAt");
ALTER TABLE "AssistantEntry" ADD CONSTRAINT "AssistantEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AssistantEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AssistantEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AssistantEntry"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "AssistantEntry" TO app_runtime;
  END IF;
END
$$;
