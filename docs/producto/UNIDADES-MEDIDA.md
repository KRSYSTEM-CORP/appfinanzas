# Unidades de medida y cantidades decimales

Cada producto elige su unidad base (`Product.unit`, y `unitLabel` solo si es «otra»). El precio es **por esa unidad**. Una empresa puede vender cloro por litro y coletos por unidad a la vez.

## Catálogo (`lib/units.ts`)
- Conteo (solo enteros): unidad, pieza, par, docena, caja, paquete, bolsa, botella, servicio.
- Volumen: litro, mililitro, galón. Peso: kilogramo, gramo, libra. Longitud: metro, centímetro. Tiempo: hora.
- «Otra»: etiqueta libre (hasta 20 letras), siempre enteros.
- Cada unidad dice si admite decimales y su factor a la base de la familia. Se aceptan alias en español al importar (`ml`, `mL`, `lt`, `L`, `kg`, `g`, `pza`, `und`...). Una unidad desconocida se informa por fila; nunca se adivina.

## Almacenamiento
- Las cantidades (`Product.stock`, `lowStockThreshold`, `StockMovement.*`, `SaleItem/QuoteItem/PurchaseItem/BranchTransferItem.quantity`) son `DECIMAL(14,3)`.
- Siempre se guardan en la **unidad base** del producto. Vender 500 ml de un producto en litros guarda 0,5 L. Las líneas guardan además `unit`/`unitLabel` (foto del momento).
- Los mínimos al mayor (`wholesaleMinQty`, `bulkMinQty`) siguen siendo enteros y se leen en unidad base.

## Redondeo
- Todo cálculo usa milésimas enteras (`toMilli`, `addQty`, `subQty`), nunca suma de flotantes.
- Total de línea = `lineTotalCents(precio, cantidad)` = precio × cantidad redondeado al céntimo (igual en POS, servidor, PDF y modo sin internet).
- En SQL crudo la cantidad viaja como texto con `::numeric` (`"stock" - $1::numeric`), no como float. Las sumas de cantidades de reportes usan `::float8` (antes `::bigint`, que habría redondeado).
- Unidades enteras rechazan decimales en el servidor (`validateQty`/`toBaseQty`). El descuento de stock sigue siendo atómico: `UPDATE ... WHERE stock >= cantidad`.

## Migración `20261129100000_unidades_medida_cantidades_decimales`
Ensancha de `INTEGER` a `NUMERIC(14,3)` con `USING col::numeric(14,3)` (sin pérdida, los valores quedan iguales) y agrega `unit TEXT NOT NULL DEFAULT 'unidad'` y `unitLabel TEXT`. Se eligió `ALTER ... TYPE` sobre columnas nuevas con relleno porque no exige doble escritura ni cambiar dos veces el código; todo producto existente queda en «unidad» sin cambiar su comportamiento. El costo es que reescribe cada tabla con bloqueo exclusivo mientras dura.

**Medición** (base vacía `kr_mig_scratch` en el VPS de pruebas, 50 000 ventas, 150 000 `SaleItem`, 150 000 `StockMovement`, 200 productos): la migración completa tarda **3,3 s** (transacción única, bloqueo exclusivo durante ese tiempo). En la base de pruebas real (314 partidas) tardó 1,5 s. Se recomienda aplicarla en horario de poco movimiento y con respaldo; el despliegue de código debe ir justo después (el código nuevo lee `unit`).

## Pantallas
- Producto (crear/editar): selector de unidad con buscador (`components/shared/UnitSelect.tsx`).
- POS y presupuestos: `QuantityInput` acepta decimales y trae selector de unidad dentro de la misma familia con conversión.
- Recibos, nota de entrega, presupuestos PDF: «0,5 L», «2 cajas». Los productos en «unidad» siguen mostrando solo el número, como antes.
- Excel: columna «Unidad» (y «Etiqueta de unidad» para «otra») en plantilla de importación, exportación y actualización masiva. Sin columna = «unidad».
- Compras: cantidad y costo por empaque + «Unidades por empaque» (caja de 12): entran 12 × cajas a la unidad base.
- Traspasos: exigen la misma unidad en origen y destino. Reposición sugerida: redondea a milésimas si la unidad admite decimales.

## Pendiente conocido
- Notas de crédito/débito siguen «Próximamente».
- Mínimos al mayor/gran mayor son enteros.
