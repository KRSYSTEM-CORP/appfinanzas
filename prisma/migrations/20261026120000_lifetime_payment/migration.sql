-- One-time lifetime payment: approving it exempts the company from monthly fees.
ALTER TABLE "PaymentReport" ADD COLUMN "isLifetime" BOOLEAN NOT NULL DEFAULT false;
