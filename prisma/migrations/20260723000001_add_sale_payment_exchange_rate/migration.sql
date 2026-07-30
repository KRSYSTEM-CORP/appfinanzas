-- Per-line exchange rate snapshot, so each installment of a credit sale
-- collected in abonos over several days keeps its own day's rate.
ALTER TABLE "SalePayment" ADD COLUMN "exchangeRate" DECIMAL(12,4);
