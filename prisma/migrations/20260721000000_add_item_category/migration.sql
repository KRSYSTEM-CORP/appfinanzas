-- Snapshot the product's category on each sale/quote line item, same
-- reasoning as the existing productName snapshot: a product's category can
-- change (or the product can be deleted) after the sale, but the document
-- must keep showing what was actually sold. Needed to tell apart two
-- products that share a name but differ by category. Nullable, no backfill
-- needed for existing rows (they simply show no category).
ALTER TABLE "SaleItem" ADD COLUMN "category" TEXT;
ALTER TABLE "QuoteItem" ADD COLUMN "category" TEXT;
