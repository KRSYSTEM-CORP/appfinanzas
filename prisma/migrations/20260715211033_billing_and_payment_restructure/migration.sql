-- Company.billingExchangeRate is dropped in favor of a single platform-wide
-- rate on PlatformSettings — confirmed no company had a value set here yet.
ALTER TABLE "Company" DROP COLUMN "billingExchangeRate",
ADD COLUMN     "fiscalAddress" TEXT,
ADD COLUMN     "fiscalLegalName" TEXT,
ADD COLUMN     "fiscalPhone" TEXT,
ADD COLUMN     "fiscalRif" TEXT;

-- PaymentReport's singular paymentMethod/reference are replaced by
-- PaymentReportLine (multi-method reporting) below; proofImageDataUrl added
-- for the required payment-proof image.
ALTER TABLE "PaymentReport" DROP COLUMN "paymentMethod",
DROP COLUMN "reference",
ADD COLUMN     "proofImageDataUrl" TEXT;

ALTER TABLE "PlatformSettings" ADD COLUMN     "billingExchangeRate" DECIMAL(12,4);

CREATE TABLE "SalePayment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amountEurCents" INTEGER NOT NULL,
    "paidInForeignCurrency" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalePayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentReportLine" (
    "id" TEXT NOT NULL,
    "paymentReportId" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "amountEurCents" INTEGER NOT NULL,
    "reference" TEXT,

    CONSTRAINT "PaymentReportLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SalePayment_saleId_idx" ON "SalePayment"("saleId");

CREATE INDEX "PaymentReportLine_paymentReportId_idx" ON "PaymentReportLine"("paymentReportId");

ALTER TABLE "SalePayment" ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentReportLine" ADD CONSTRAINT "PaymentReportLine_paymentReportId_fkey" FOREIGN KEY ("paymentReportId") REFERENCES "PaymentReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
