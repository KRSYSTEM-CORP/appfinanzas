-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowedSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
