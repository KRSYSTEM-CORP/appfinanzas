-- Optional free-text note on a Quote, printed on the generated PDF/print
-- view when set. Sale already has this column from an earlier migration.
ALTER TABLE "Quote" ADD COLUMN "note" TEXT;
