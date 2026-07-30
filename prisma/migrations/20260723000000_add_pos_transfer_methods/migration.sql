-- Kept in its own migration: adding an enum value and using it in the same
-- transaction is unsafe on older Postgres. Nothing in this or any later
-- migration references the new values, so this is safe regardless.
ALTER TYPE "PaymentMethod" ADD VALUE 'POS';
ALTER TYPE "PaymentMethod" ADD VALUE 'TRANSFER';
