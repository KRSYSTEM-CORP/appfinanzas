-- Porcentajes de deducción de nómina por empresa (antes fijos en el código).
ALTER TABLE "Company" ADD COLUMN "payrollIvssPct" DOUBLE PRECISION NOT NULL DEFAULT 4;
ALTER TABLE "Company" ADD COLUMN "payrollParoPct" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
ALTER TABLE "Company" ADD COLUMN "payrollFaovPct" DOUBLE PRECISION NOT NULL DEFAULT 1;
