-- Extends the Row-Level Security safety net (see the earlier
-- add_rls_policies migration) to the new PaymentReport table. Same pattern:
-- visible only to the matching company (app.company_id) or the super admin
-- escape hatch (app.is_super_admin). PlatformSettings is intentionally left
-- out — it's a single global row, not tenant data.

ALTER TABLE "PaymentReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentReport"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );
