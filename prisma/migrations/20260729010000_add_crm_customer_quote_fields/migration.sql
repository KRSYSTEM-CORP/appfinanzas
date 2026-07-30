-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'CONVERTED', 'LOST');

-- AlterTable: Customer notes + follow-up reminder
ALTER TABLE "Customer"
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "nextContactDate" DATE;

-- AlterTable: Quote follow-up status
ALTER TABLE "Quote" ADD COLUMN "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING';
