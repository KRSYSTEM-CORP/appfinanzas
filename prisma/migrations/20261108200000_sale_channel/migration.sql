-- Canal de venta (Mostrador, Delivery, Pick-up, Online). Las ventas existentes quedan en MOSTRADOR.
CREATE TYPE "SaleChannel" AS ENUM ('MOSTRADOR', 'DELIVERY', 'PICKUP', 'ONLINE');
ALTER TABLE "Sale" ADD COLUMN "channel" "SaleChannel" NOT NULL DEFAULT 'MOSTRADOR';
