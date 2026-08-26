-- Row-Level Security for PurchasePayment — same pattern as SalePayment
-- (PurchasePayment has no companyId of its own, so the policy checks the
-- parent Purchase row's companyId via EXISTS). Missed when the table was
-- first created; every other tenant-scoped table already has this.
ALTER TABLE "PurchasePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchasePayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PurchasePayment"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Purchase"
      WHERE "Purchase"."id" = "PurchasePayment"."purchaseId"
        AND "Purchase"."companyId" = current_setting('app.company_id', true)
    )
  );
