-- Monotonic per-branch document counters (audit KRPOS-DB-001). Document
-- numbers used to be count(*) + 1, which repeats a number after a delete and
-- breaks the @@unique([branchId, ...]) constraints for the whole branch.
ALTER TABLE "Branch" ADD COLUMN "nextSaleNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Branch" ADD COLUMN "nextReceiptNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Branch" ADD COLUMN "nextInvoiceNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Branch" ADD COLUMN "nextQuoteNumber" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Branch" ADD COLUMN "nextPurchaseNumber" INTEGER NOT NULL DEFAULT 0;

-- Backfill with the highest number already used per branch.
UPDATE "Branch" b SET
  "nextSaleNumber"     = COALESCE((SELECT MAX("controlNumber") FROM "Sale" s WHERE s."branchId" = b."id"), 0),
  "nextReceiptNumber"  = COALESCE((SELECT MAX("receiptControlNumber") FROM "Sale" s WHERE s."branchId" = b."id"), 0),
  "nextInvoiceNumber"  = COALESCE((SELECT MAX("invoiceNumber") FROM "Sale" s WHERE s."branchId" = b."id"), 0),
  "nextQuoteNumber"    = COALESCE((SELECT MAX("controlNumber") FROM "Quote" q WHERE q."branchId" = b."id"), 0),
  "nextPurchaseNumber" = COALESCE((SELECT MAX("controlNumber") FROM "Purchase" p WHERE p."branchId" = b."id"), 0);
