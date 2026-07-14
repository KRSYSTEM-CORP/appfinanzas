-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'CREDIT');

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID';

