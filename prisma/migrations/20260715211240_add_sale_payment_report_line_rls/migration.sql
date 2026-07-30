-- Same Row-Level Security pattern as SaleItem/QuoteItem: neither table has
-- its own companyId, so each policy checks the parent row's companyId via
-- EXISTS instead.

ALTER TABLE "SalePayment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SalePayment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SalePayment"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "Sale"
      WHERE "Sale"."id" = "SalePayment"."saleId"
        AND "Sale"."companyId" = current_setting('app.company_id', true)
    )
  );

ALTER TABLE "PaymentReportLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentReportLine" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PaymentReportLine"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "PaymentReport"
      WHERE "PaymentReport"."id" = "PaymentReportLine"."paymentReportId"
        AND "PaymentReport"."companyId" = current_setting('app.company_id', true)
    )
  );
