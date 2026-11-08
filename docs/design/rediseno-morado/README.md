# Rediseño de KR POS — previews aprobadas (versión morada)

Previews HTML de una sola página (sin servidor): abre `kr-pos-sistema.html` en el navegador (app completa con menú,
roles, bloqueo y todos los módulos) o cada módulo por separado. Son la **referencia de diseño y de flujos** para
implementar el rediseño módulo por módulo en la app real; los datos son de ejemplo.

## Reglas de producto acordadas (resumen)
- **Mejorar, no reemplazar:** se conservan las funciones actuales (ventas con detalle de pago, abonos, documentos,
  compras, cierres de caja, nómina…) con el nuevo diseño y apartados nuevos.
- **Planes:** Emprende $12,99 (nuevos usuarios $10 solo el primer mes), Pyme $23,99, Corporativo $44,99.
  Contabilidad solo en Pyme y Corporativo. Corporativo: productos ilimitados. Pago a la tasa dólar BCV del día.
- **Canales de venta:** Mostrador, Delivery, Pick-up y Online. Ventas del día igual en POS y Caja Chica.
- **Documentos:** ticket 58/80 mm, hoja carta con vista previa, PDF y WhatsApp para todos (venta, presupuesto,
  recibos, notas de débito/crédito, abonos, nómina).
- **Cuentas bancarias:** varias cuentas por método con logo y datos para cobrar visibles en el POS.
- **Marketing** (antes Clientes/CRM) como módulo propio en el menú. Ajustes: sin horario ni modo sin internet,
  IGTF configurable.
- Estados de Mi Plan, pago y comprobante: nombre, teléfono, referencia y comprobante obligatorios; correo opcional.
