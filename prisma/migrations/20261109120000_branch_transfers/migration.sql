-- Traspasos de mercancía entre sucursales.
CREATE TABLE "BranchTransfer" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchTransfer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BranchTransfer_companyId_createdAt_idx" ON "BranchTransfer"("companyId", "createdAt");
ALTER TABLE "BranchTransfer" ADD CONSTRAINT "BranchTransfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchTransfer" ADD CONSTRAINT "BranchTransfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BranchTransfer" ADD CONSTRAINT "BranchTransfer_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BranchTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "BranchTransferItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BranchTransferItem_transferId_idx" ON "BranchTransferItem"("transferId");
ALTER TABLE "BranchTransferItem" ADD CONSTRAINT "BranchTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "BranchTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BranchTransfer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchTransfer" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BranchTransfer"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR "companyId" = current_setting('app.company_id', true)
  );

-- Los renglones heredan el aislamiento de su traspaso.
ALTER TABLE "BranchTransferItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BranchTransferItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BranchTransferItem"
  USING (
    current_setting('app.is_super_admin', true) = 'true'
    OR EXISTS (
      SELECT 1 FROM "BranchTransfer" t
      WHERE t."id" = "BranchTransferItem"."transferId"
        AND t."companyId" = current_setting('app.company_id', true)
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "BranchTransfer" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "BranchTransferItem" TO app_runtime;
  END IF;
END
$$;
