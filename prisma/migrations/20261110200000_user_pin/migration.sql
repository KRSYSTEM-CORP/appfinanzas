-- PIN por persona para el bloqueo de pantalla (aditiva: columnas opcionales).
ALTER TABLE "User" ADD COLUMN "pinHash" TEXT;
ALTER TABLE "User" ADD COLUMN "pinKey" TEXT;
-- Dos personas de la misma empresa no pueden tener el mismo PIN. Los NULL no chocan entre sí.
CREATE UNIQUE INDEX "User_companyId_pinKey_key" ON "User"("companyId", "pinKey");
