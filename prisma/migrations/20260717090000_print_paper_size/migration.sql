-- CreateEnum
CREATE TYPE "PrintPaperSize" AS ENUM ('THERMAL_58', 'THERMAL_80', 'LETTER', 'A4');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "printPaperSize" "PrintPaperSize" NOT NULL DEFAULT 'LETTER';
