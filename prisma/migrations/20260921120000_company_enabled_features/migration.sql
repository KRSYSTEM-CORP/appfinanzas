-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "enabledFeatures" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
