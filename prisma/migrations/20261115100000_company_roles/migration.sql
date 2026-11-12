-- Roles con permisos editables por empresa (aditiva; los usuarios actuales siguen igual con roleId nulo).
CREATE TABLE "CompanyRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseRole" "Role" NOT NULL DEFAULT 'VENDEDOR',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompanyRole_companyId_name_key" ON "CompanyRole"("companyId", "name");
CREATE INDEX "CompanyRole_companyId_idx" ON "CompanyRole"("companyId");
ALTER TABLE "CompanyRole" ADD CONSTRAINT "CompanyRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "roleId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "CompanyRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompanyRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompanyRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CompanyRole"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "CompanyRole" TO app_runtime;
  END IF;
END
$$;
