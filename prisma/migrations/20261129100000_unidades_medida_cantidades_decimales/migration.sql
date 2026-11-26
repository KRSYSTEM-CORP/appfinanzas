-- Unidades de medida y cantidades decimales.
-- Ensancha de INTEGER a NUMERIC(14,3): sin pérdida (todo entero cabe) y los valores existentes quedan iguales.
-- Cada ALTER reescribe su tabla con bloqueo breve; los tiempos medidos están en docs/producto/UNIDADES-MEDIDA.md.
ALTER TABLE "Product"
  ALTER COLUMN "stock" DROP DEFAULT,
  ALTER COLUMN "stock" TYPE DECIMAL(14,3) USING "stock"::numeric(14,3),
  ALTER COLUMN "stock" SET DEFAULT 0,
  ALTER COLUMN "lowStockThreshold" DROP DEFAULT,
  ALTER COLUMN "lowStockThreshold" TYPE DECIMAL(14,3) USING "lowStockThreshold"::numeric(14,3),
  ALTER COLUMN "lowStockThreshold" SET DEFAULT 5,
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'unidad',
  ADD COLUMN "unitLabel" TEXT;

ALTER TABLE "StockMovement"
  ALTER COLUMN "quantityChange" TYPE DECIMAL(14,3) USING "quantityChange"::numeric(14,3),
  ALTER COLUMN "stockBefore" TYPE DECIMAL(14,3) USING "stockBefore"::numeric(14,3),
  ALTER COLUMN "stockAfter" TYPE DECIMAL(14,3) USING "stockAfter"::numeric(14,3);

ALTER TABLE "SaleItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,3) USING "quantity"::numeric(14,3),
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'unidad',
  ADD COLUMN "unitLabel" TEXT;

ALTER TABLE "QuoteItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,3) USING "quantity"::numeric(14,3),
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'unidad',
  ADD COLUMN "unitLabel" TEXT;

ALTER TABLE "PurchaseItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,3) USING "quantity"::numeric(14,3),
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'unidad',
  ADD COLUMN "unitLabel" TEXT;

ALTER TABLE "BranchTransferItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,3) USING "quantity"::numeric(14,3),
  ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'unidad',
  ADD COLUMN "unitLabel" TEXT;
