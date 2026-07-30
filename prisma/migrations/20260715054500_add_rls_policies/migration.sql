-- Row-Level Security safety net for tenant-scoped business data.
--
-- Every policy checks two things: the platform-admin escape hatch
-- (app.is_super_admin, set only by lib/actions/admin.ts after
-- requireSuperAdmin() has verified the caller) or a companyId match against
-- app.company_id (set per-request by lib/tenant-db.ts withTenant()). Both
-- session variables are read with the `true` (missing_ok) form of
-- current_setting, so a request that never set them sees zero rows instead
-- of erroring or leaking every company's data.
--
-- FORCE ROW LEVEL SECURITY is required because the app connects as the
-- table owner, which Postgres exempts from RLS by default.
--
-- "User" and "Company" are deliberately excluded: login (lib/actions/auth.ts)
-- and getSession() (lib/session.ts) must read them before any tenant context
-- exists, since that's the mechanism that establishes app.company_id in the
-- first place. Those two tables stay protected by the existing, small,
-- already-audited session code instead.

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Customer"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Sale" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Sale"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

ALTER TABLE "Quote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Quote" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Quote"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Payment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

-- SaleItem/QuoteItem have no companyId of their own — scope them through
-- their parent row instead.

ALTER TABLE "SaleItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SaleItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SaleItem"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Sale"
      WHERE "Sale"."id" = "SaleItem"."saleId"
        AND "Sale"."companyId" = current_setting('app.company_id', true)
    )
  );

ALTER TABLE "QuoteItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuoteItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QuoteItem"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Quote"
      WHERE "Quote"."id" = "QuoteItem"."quoteId"
        AND "Quote"."companyId" = current_setting('app.company_id', true)
    )
  );
