-- Exigir cliente identificado en cada venta (aditiva, apagado por defecto).
ALTER TABLE "Company" ADD COLUMN "requireCustomerOnSale" BOOLEAN NOT NULL DEFAULT false;
