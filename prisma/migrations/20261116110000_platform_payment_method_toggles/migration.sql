-- Plataforma: interruptores de método de pago, CRM de empresas, cupones de suscripción e historial de correos (aditiva).
ALTER TABLE "PlatformSettings" ADD COLUMN "pagoMovilEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PlatformSettings" ADD COLUMN "binanceEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Company" ADD COLUMN "crmNote" TEXT;
ALTER TABLE "Company" ADD COLUMN "crmNextContactAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "crmTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "PlatformCoupon" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "percentOff" INTEGER,
    "amountOffUsd" INTEGER,
    "plan" "PlanTier",
    "companyId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "maxUses" INTEGER DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformCoupon_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformCoupon_code_key" ON "PlatformCoupon"("code");
CREATE INDEX "PlatformCoupon_companyId_idx" ON "PlatformCoupon"("companyId");
ALTER TABLE "PlatformCoupon" ADD CONSTRAINT "PlatformCoupon_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformCouponRedemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "paymentReportId" TEXT,
    "discountUsdCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformCouponRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformCouponRedemption_couponId_companyId_key" ON "PlatformCouponRedemption"("couponId", "companyId");
CREATE INDEX "PlatformCouponRedemption_companyId_idx" ON "PlatformCouponRedemption"("companyId");
ALTER TABLE "PlatformCouponRedemption" ADD CONSTRAINT "PlatformCouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "PlatformCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlatformCouponRedemption" ADD CONSTRAINT "PlatformCouponRedemption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformEmailLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "recipients" INTEGER NOT NULL,
    "sent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformEmailLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformEmailLog_createdAt_idx" ON "PlatformEmailLog"("createdAt");

CREATE TABLE "PlatformAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "companyId" TEXT,
    "companyName" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");
CREATE INDEX "PlatformAuditLog_action_createdAt_idx" ON "PlatformAuditLog"("action", "createdAt");

CREATE TABLE "PlatformAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'info',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "segment" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformAnnouncement_active_createdAt_idx" ON "PlatformAnnouncement"("active", "createdAt");

ALTER TABLE "PlatformCoupon" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformCoupon" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlatformCoupon"
  USING (current_setting('app.is_super_admin', true) = 'true' OR "companyId" IS NULL OR "companyId" = current_setting('app.company_id', true));
ALTER TABLE "PlatformCouponRedemption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformCouponRedemption" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PlatformCouponRedemption"
  USING (current_setting('app.is_super_admin', true) = 'true' OR "companyId" = current_setting('app.company_id', true));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PlatformCoupon" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PlatformCouponRedemption" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PlatformEmailLog" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PlatformAuditLog" TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON "PlatformAnnouncement" TO app_runtime;
  END IF;
END
$$;
