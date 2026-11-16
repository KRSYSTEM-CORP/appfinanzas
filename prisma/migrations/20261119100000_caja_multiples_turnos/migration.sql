-- Varios turnos de caja por día y sede: cada turno con su responsable, apertura y cierre.
ALTER TABLE "CashOpening" ADD COLUMN "shiftNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CashOpening" ADD COLUMN "responsibleName" TEXT;
DROP INDEX "CashOpening_branchId_date_key";
CREATE UNIQUE INDEX "CashOpening_branchId_date_shiftNumber_key" ON "CashOpening"("branchId", "date", "shiftNumber");

ALTER TABLE "CashClosing" ADD COLUMN "shiftNumber" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "CashClosing" ADD COLUMN "responsibleName" TEXT;
ALTER TABLE "CashClosing" ADD COLUMN "openedAt" TIMESTAMP(3);
DROP INDEX "CashClosing_branchId_closingDate_key";
CREATE UNIQUE INDEX "CashClosing_branchId_closingDate_shiftNumber_key" ON "CashClosing"("branchId", "closingDate", "shiftNumber");
ALTER TABLE "CashOutflow" ADD COLUMN "shiftNumber" INTEGER NOT NULL DEFAULT 1;
