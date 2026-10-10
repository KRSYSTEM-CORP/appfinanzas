-- Lets a gasto be recorded in the local currency (Bs.) as well as the
-- reference currency. amountCents keeps meaning "reference-currency cents",
-- so existing rows and every Finanzas total are unchanged; the new columns
-- are optional or defaulted.
ALTER TABLE "Expense" ADD COLUMN "enteredInLocal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Expense" ADD COLUMN "localAmountCents" INTEGER;
ALTER TABLE "Expense" ADD COLUMN "exchangeRate" DECIMAL(12,4);
