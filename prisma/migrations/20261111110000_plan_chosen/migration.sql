-- Elegir plan al crear la cuenta (aditiva). Las empresas existentes ya tienen plan.
ALTER TABLE "Company" ADD COLUMN "planChosen" BOOLEAN NOT NULL DEFAULT true;
