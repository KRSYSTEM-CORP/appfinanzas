-- Row-Level Security for PagoMovilOrder — same pattern as every other
-- tenant-scoped table: visible only to the matching company (app.company_id)
-- or the super admin escape hatch. The one caller that needs to see across
-- every company (checking for an amount collision when generating a new
-- order) does so via withSuperAdmin, same as the rest of the app.
ALTER TABLE "PagoMovilOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PagoMovilOrder" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PagoMovilOrder"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );
