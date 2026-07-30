-- Kept in its own migration: adding multiple enum values and using them in
-- the same transaction is unsafe on older Postgres. Nothing in this or any
-- later migration references the new values, so this is safe regardless.
ALTER TYPE "PaymentMethod" ADD VALUE 'ZELLE';
ALTER TYPE "PaymentMethod" ADD VALUE 'BINANCE';
