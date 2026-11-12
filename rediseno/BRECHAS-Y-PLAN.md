# KR POS · Brechas contra la preview y plan de trabajo

Revisión del repositorio `APP NEW` (rama `claude/auditoria-pantallas`, último commit `3b94df1`) contra la preview "KR POS · Sistema completo".

**Cómo se hizo:** lectura del código (rutas, componentes, textos visibles de cada pantalla, esquema Prisma, `lib/plans.ts`, `lib/assistant.ts`, tareas programadas). Después se abrió la app real con la empresa de pruebas y se comparó cada módulo contra la preview: las diferencias visuales están en `PARIDAD-VISUAL.md` §1. Lo que aquí sigue marcado "verificar" no se pudo confirmar en esa pasada.

## 1. Estado general

El sistema ya está encaminado hacia la preview. Stack: Next.js 16, React 19, Tailwind 4, shadcn/Base UI, Prisma 7 sobre Postgres (Supabase) con aislamiento por empresa (`withTenant`), jsPDF, ExcelJS, Resend, R2, Capacitor.

Ya coincide con la preview:
- Colores, sombras, radio y tipografía Hanken Grotesk (`app/globals.css`, `app/layout.tsx`).
- Menú lateral de 260px con los tres grupos, color por módulo, sede activa, plan y tasa (`components/nav/Sidebar.tsx`).
- Tarjeta de acceso con carrusel, Google, perfiles y PIN, pantalla de bloqueo, aviso de inactividad.
- Planes y precios (`lib/plans.ts`): Emprende $12,99 con primer mes a $10, Pyme $23,99, Corporativo $44,99, con sus límites.
- Paquetes de créditos IA con los mismos precios (`lib/assistant.ts`).
- Tasa BCV automática diaria a las 7:00 p. m. (`app/api/cron/bcv-rate`).
- Asistente con modelo de lenguaje real, propuesta → aplicar → deshacer.
- Learning con subida real de video y progreso.

Las copias de la preview ya están en `docs/design/rediseno-morado/`. El archivo `kr-pos-sistema.html` del repositorio **no es idéntico** al de la preview publicada; usar `rediseno/referencia/00-shell-login-bloqueo-planes.html` de este paquete.

## 2. Decisiones del dueño ya tomadas

1. **Factura fiscal:** en el POS aparece como opción de documento, sombreada y con candado; no se puede elegir. Hoy la pantalla de cobro solo muestra "Nota de entrega" con el texto "Podrás emitir la factura al terminar la venta", y la venta completada ofrece "Generar factura": ambas cosas se retiran del POS. Libros y facturas ya emitidas no se tocan.
2. **Ajustes sin horario de atención.** No se implementa aunque la preview lo muestre.
3. **Modo sin internet:** se usa el que ya existe. En Ajustes solo se muestra su estado.
4. **Ganancia de Inicio:** se mantiene la fórmula actual, con las ventas de los días que ya tienen cierre de caja.
5. **Recargas de créditos IA:** llevan etiqueta de ahorro (10 %, 20 %, 30 %, −40 %).
6. **WhatsApp:** vinculado por código QR como dispositivo, desde Marketing.
7. **Asistente IA:** proveedor gratuito, sin costo por uso.
8. **Único descuento de suscripción:** Emprende a $10 el primer mes.
9. **Marketing:** todo lo de clientes vive ahí.

## 3. Brecha estructural más grande: roles y permisos

| Preview | Hoy |
|---|---|
| 6 roles: Dueño, Administrador, Gerente, Cajero, Vendedor, Contador | 2 roles: `GERENTE`, `VENDEDOR` (enum `Role`) |
| 12 permisos por módulo y acción | 6 secciones solo para vendedores (`lib/sections.ts`) |
| Crear roles nuevos y editar permisos | No existe |
| Minutos de inactividad por rol | Un valor por equipo (5/10/15) |
| Inicio y Learning para todos | Inicio, Estadísticas y Administración solo gerente |
| Aviso de renovación solo al Dueño | Verificar a quién se muestra |

Afecta a todos los módulos. Requiere migración aditiva: tabla de roles y permisos por empresa, conservando `GERENTE`/`VENDEDOR` como base.

## 4. Brechas por módulo

Leyenda: **Falta** = no existe · **Parcial** = existe distinto o incompleto · **Sobra** = existe y la preview no lo tiene.

### Shell y navegación — `components/nav/Sidebar.tsx`
- Parcial: el cambio a barra inferior ocurre a 768px (`md:`); en la preview es a 960px.
- Sobra: módulo **Documentos** en el grupo Control; menú lateral colapsable; barra superior en teléfono; en la hoja "Más" aparecen "Perfiles y PIN", "Suscripción mensual" y "Nómina".
- Parcial: la barra inferior usa Marketing como reemplazo; la preview usa otra regla de sustitución (función `bk()`).
- Falta: animación de cambio de sede ("Sede anterior → Sede nueva · Entrando a la sede…").
- Verificar: botón central elevado de 54px y hoja "Más" en cuadrícula de 3 columnas.

### Acceso y bloqueo — `components/auth/*`, `components/lock/*`
- Sobra: paso "Elige tu sucursal" y código de empresa en el acceso.
- Parcial: PIN de 4 a 6 dígitos; la preview usa 4.
- Parcial: aviso de inactividad dice "Por seguridad, la pantalla se bloqueará en N s. Toca para continuar"; la preview: "Se bloqueará en N s" + botón "Seguir aquí".
- Parcial: aviso de renovación (`RenewalBanner.tsx`) con otro texto y destino; la preview usa tarjeta flotante con tres textos según los días y solo para el Dueño.
- Verificar: estilo de vidrio esmerilado con reloj grande en la pantalla de bloqueo; pie "Soporte" con WhatsApp y correo.

### Selector de periodo — `components/shared/DateRangeSwitcher.tsx`
- Parcial: tiene Hoy, 7 días, Mes, Meses y Rango, pero Rango usa dos campos de fecha.
- Falta: calendario de toque (día inicial y final), atajos de Rango (Ayer, Esta semana, Semana pasada, 1.ª y 2.ª quincena, Mes pasado) y atajos de Meses (Este mes, Últimos 3 meses, Últimos 6 meses, Todo el año).

### Inicio — `app/home/page.tsx`
- Casi completo.
- Falta: proyección "A este ritmo cierras el mes en $…"; % de margen en la tarjeta principal (verificar).
- Se mantiene: la ganancia calculada con los días que ya tienen cierre de caja.
- Parcial: "Meta de ganancia" frente a "Meta de [mes]" con dona.

### POS — `components/pos/*`, `app/pos/page.tsx`
- Verificar: el catálogo ya filtra por categoría; comprobar que sean chips con "Todos" como en la preview.
- Falta en Registrar cliente: Fecha de nacimiento y Correo.
- Falta en el cobro: "El cliente entrega" → Vuelto / Faltan y botón "Exacto"; descuentos rápidos 5/10/15/20 %; descuento en monto ($); motivo de la exoneración.
- Parcial: Documento solo ofrece Nota de entrega; debe mostrar Nota de entrega · Ticket rápido de caja · Factura fiscal sombreada con candado y "Próximamente". Retirar "Generar factura" de la venta completada.
- Falta: "Mostrar al cliente" (pantalla para el cliente con total, tasa y QR de pago).
- Falta: lista "Ventas del día / del periodo" dentro del POS con menú ⋯ y la acción "Volver a vender" (hoy enlaza a Caja Chica).
- Sobra: PayPal como método en el cobro (la preview del POS no lo lista).
- Verificar: hoja "Ventas en espera" con "Retomar".

### Inventario — `app/inventory/*`, `components/inventory/*`
- Casi completo: KPI, valor, lista de reposición, menú ⋯, movimientos, sumar existencias, Excel.
- Parcial: crear y editar producto son páginas aparte; en la preview son hojas inferiores.
- Falta: barra de uso del plan ("N de 200 productos"); hoja "Ajuste de existencias" con tipo Entrada / Salida / Conteo físico (verificar qué hace "Ajustar").
- Sobra: precios por cantidad (mayor y gran mayor), lista de precios en PDF, "Existencias por categoría", botón de Consumo interno aquí.

### Presupuestos — `app/quotes/*`, `components/quotes/*`
- Tiene: KPI, embudo, "Por qué se pierden", marcar enviado/visto, facturar, perdido con motivo.
- Parcial: los motivos de pérdida son Precio / Compró en otro lado / Sin respuesta / Otro; la preview: Precio / Compró en otro lado / No respondió / Cambió de idea.
- Parcial: "Nuevo presupuesto" es un flujo de varios pasos tipo POS; la preview es una hoja única.
- Falta: vigencia (7/15/30 días) y "Vence en N días / Vencido hace…"; descuento; "Crear y enviar por WhatsApp"; sugerencia de siguiente paso por presupuesto; historial y "Registrar seguimiento" (Llamé / Escribí por WhatsApp / Nota); "Recordarme en N días"; Duplicar; Eliminar; chips de filtro por estado.

### Caja Chica — `app/reports/page.tsx`, `components/reports/*`
- Tiene: estado, abrir caja, movimientos, salidas, Corte Z, días pendientes, historial, ventas con canal.
- Falta: al cerrar, escribir el **total contado en $ y en Bs** y mostrar Caja cuadrada / Sobrante / Faltante con la diferencia en el Corte Z.
- Parcial: la apertura es un solo monto; la preview pide saldo inicial **por método de pago**.
- Parcial: historial de cierres como vista aparte con menú ⋯ "Ver cierre" (ingresos por método).

### Estadísticas — `app/finance/page.tsx`, `components/finance/*`
- Tiene casi todos los gráficos, punto de equilibrio y hallazgos.
- Falta: conmutador Más vendidos / Menos vendidos en el Pareto; tarjeta "Menos vendidos"; "Costos y rentabilidad" (margen por producto); buscador en punto de equilibrio.
- Parcial: reporte semanal. Hoy es un interruptor de correo "cada domingo por la noche"; la preview es una lista dentro de la app, generada cada lunes 6:00 a. m., por meses, con descarga en Excel. El envío actual cuelga de la tarea `bcv-rate`.
- Sobra aquí: el panel de Gastos (en la preview vive en Administración → Balance → Gastos).

### Marketing — `app/customers/*`, `components/customers/*`
Decisión del dueño: todo lo de clientes vive aquí.
- Tiene: tabla de clientes, "Clientes a contactar", cumpleaños, ficha con notas y próximo contacto.
- Falta: KPI (Registrados, Frecuentes, Inactivos, Cumpleañeros); **Mapa de clientes** por cuadrantes; interruptor "Exigir nombre y teléfono en cada venta"; Importar Excel y Plantilla de clientes; **Promociones** completas (lista, descuento, vigencia, código, vista previa de WhatsApp, canjes).
- Mover: **Cuentas por cobrar** está en `app/accounting/receivables`; debe ser sub-pestaña de Marketing, con antigüedad 0-30 / 31-60 / más de 60 días.

### Administración — `app/accounting/*`, `app/purchases/*`, `app/suppliers/*`, `app/payroll/*`, `app/tax-book/*`
- Parcial (estructura): hoy es un índice de enlaces a siete páginas separadas. La preview es un solo módulo con tarjetas de grupo y sub-pestañas: Balance · Cuentas Bancarias · Compras · Consumo Interno · Contabilidad.
- Balance: Resumen y Gastos existen dentro de Estadísticas; falta Cobros por método como vista y **gastos recurrentes** con aviso.
- Cuentas Bancarias: hoy solo hay "datos para cobrar" (`PaymentAccount`). Faltan **saldos por cuenta**, total en $ y Bs, y el **vínculo método → cuenta** que sube el saldo al cobrar.
- Compras: registro e importación existen. Faltan **Órdenes de pago**, **Calificación de proveedores**, comparativa de último costo y "Fraccionar pago".
- Consumo Interno: hoy es un botón en Inventario. Falta el módulo: Socio o Personal, KPI, "Quién retira más", editar y eliminar.
- Contabilidad: faltan **Movimientos**, **Estado de resultados** con traductor contable, **Situación financiera** con semáforo y **Análisis de costo**. Nómina existe y está cerca. Libros existen; falta "Cargar factura" manual y el Resumen de IVA con débito, crédito y saldo.
- Verificar: candado "Desde el plan Pyme" sobre Contabilidad en plan Emprende (`lib/features.ts`).
- Sobra: página "Ventas por vendedor".

### Sucursales — `app/branches/*`, `components/branches/*`
- Tiene: KPI de red, alertas, tarjetas con meta, comparativa, sugerencias de traspaso.
- Parcial: "Entrar con clave" pide la clave del usuario; la preview usa una **clave de 4 dígitos por sede**, con intentos limitados, "Bloquear las demás" y cambio de clave.
- Parcial: traspasos se registran directo como Recibido; faltan los estados Solicitado → En camino → Recibido.
- Parcial: "Reglas de la red" son textos fijos; la preview tiene interruptores (Inventario compartido, Casa Matriz, Precios distintos por sede, Tasa única).
- Falta: selector de periodo (hoy fijo al mes), ficha de sede, "Nueva sucursal" desde aquí con catálogo inicial y clave, copiar catálogo, WhatsApp de la sede, desactivar desde aquí.

### Asistente IA — `app/assistant/*`, `components/assistant/*`, `lib/actions/assistant.ts`
- Tiene: chat real, dictado, propuesta con costo, aplicar, deshacer 24 h, créditos.
- Falta: las tres pestañas (Asistente · Créditos · Historial).
- Parcial: solo aplica dos acciones (registrar gasto, ajustar precios). Faltan: inventario desde Excel, recordatorios de cobro, promoción para clientes dormidos, armar presupuesto, explicar la ganancia.
- Falta: Controles (tope mensual, solo el gerente aplica, deshacer 24 h), tabla "Cómo se cobra", desglose Incluidos / Comprados / Usados.
- Parcial: la recarga es un formulario con referencia; la preview la lleva al flujo de pago con comprobante en Ajustes → Mi Plan.

### Learning — `components/learning/LearningPanel.tsx`
- Tiene: videos, progreso, modo administrador, métricas.
- Falta: quiz con insignia, capítulos, filtro "Para ti / Todo" por rol, anillo de avance e insignia "Experto KR POS", visto automático, límite de 10 videos.

### Ajustes — `app/settings/*`, `components/settings/*`, `app/billing/*`, `app/employees/*`
- Tiene: las seis secciones, la guía paso a paso, moneda, tasa, IVA e IGTF, datos para cobrar, apariencia.
- Mi Plan: cambiar de plan hoy es "escribe al soporte"; la preview lo hace dentro de la app. El pago vive en `/billing` con otro diseño; falta el flujo de 3 pasos con estados Reportado → En revisión → Aprobado dentro de Mi Plan, la capacidad con Sedes y las recargas de créditos.
- Marca: faltan paletas recomendadas a partir del logo y la vista previa en ticket y presupuesto.
- Negocio: faltan país, WhatsApp e Instagram. El horario no se implementa (decisión del dueño).
- Pagos y Moneda: faltan activar/desactivar métodos con su moneda, "Próxima tasa" con fecha valor, "Adelantar la próxima tasa", fijar tasa manual con aviso y cargo por servicio.
- Equipo y Seguridad: vive aparte en `/employees`; faltan matriz de roles y permisos, crear rol, minutos por rol, claves por sede e imagen por rol.
- Impresión y Datos: faltan lista de impresoras con "Imprimir prueba", exportaciones (respaldo de cobros, historial de ventas), reporte diario por correo y el estado del modo sin internet que ya existe.

### Descuentos de suscripción
- El código ya cumple la decisión: no hay cupones y el único precio especial es Emprende a $10 el primer mes (`amountDueUsdCents`).
- Ajuste menor: en `app/billing/page.tsx` cambiar "Precio de bienvenida" por un texto que nombre solo el primer mes de Emprende.
- La discrepancia está en la preview (cupón, 50 %, tarjeta de bienvenida). No copiar esos bloques.

## 5. Funciones reales: qué hay y qué falta

| Función | Estado hoy |
|---|---|
| Tasa BCV automática | Real. Falta mostrar próxima tasa y adelantarla |
| Google | Real (`lib/google-oauth.ts`); necesita `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` |
| PDF e impresión | Real (jsPDF, tamaños de papel) |
| WhatsApp | Solo enlaces `wa.me` y PDF descargado para adjuntar. Falta el vínculo por QR como dispositivo y el envío desde el sistema (fase 22) |
| Asistente IA | Real, pero con un proveedor de pago (`ANTHROPIC_API_KEY`). Pasa a proveedor gratuito configurable (fase 19). Faltan acciones |
| Pago de suscripción | Real con comprobante y aprobación en `/admin` |
| Recarga de créditos | Real por solicitud, sin comprobante adjunto |
| Modo sin internet | Real en el POS (`app/pos/offline`, `lib/offline`); se conserva tal cual |
| Reporte semanal | Parcial (correo, dentro de la tarea `bcv-rate`); falta la vista en la app y el horario del lunes 6:00 a. m. |
| Reporte diario por correo | Falta |
| Excel | Real para inventario y compras; falta clientes, cobros y ventas |
| Videos de Learning | Real con R2 |
| Factura fiscal | Hoy se puede generar al terminar la venta; queda bloqueada con candado en el POS |

## 6. Plan de trabajo

Reglas del repositorio que mandan (de `AGENTS.md`): rama propia `claude/<tema>`, nunca directo a `main`, migraciones solo aditivas y nunca contra producción sin autorización, toda consulta dentro de `withTenant`, y antes de cerrar `npx tsc --noEmit`, `npx eslint .` y `npx next build` en verde. Leer la guía de Next en `node_modules/next/dist/docs/` antes de escribir código.

Una fase por sesión y por rama. El prompt está en `PROMPT-MAESTRO.md`.

| # | Fase | Rama | Tamaño |
|---|---|---|---|
| 0 | **Base visual**: diferencias globales G1 a G18 de `PARIDAD-VISUAL.md`, hoja inferior, medidas exactas, `data-kr` (prompt en `PROMPT-MAESTRO.md`) | `claude/base-visual` | Mediana |
| 1 | Shell: lo que quede del menú y animación de cambio de sede | `claude/shell-preview` | Pequeña |
| 2 | Selector de periodo con calendario y atajos | `claude/selector-periodo` | Pequeña |
| 3 | Roles y permisos (modelo, migración, guardas, matriz en Ajustes) | `claude/roles-permisos` | **Grande, esfuerzo medio** |
| 4 | Acceso y bloqueo: PIN de 4, textos, minutos por rol, aviso de renovación | `claude/acceso-bloqueo` | Pequeña |
| 5 | POS · catálogo y cliente: categorías, nacimiento y correo, ventas del periodo, volver a vender | `claude/pos-catalogo` | Mediana |
| 6 | POS · cobro: vuelto, descuentos rápidos, exoneración con motivo, documento, pantalla del cliente, factura bloqueada | `claude/pos-cobro` | Mediana |
| 7 | Caja Chica: apertura por método, conteo $ y Bs, diferencia, historial | `claude/caja-conteo` | Mediana |
| 8 | Presupuestos: hoja única, vigencia, seguimiento, recordatorio, duplicar | `claude/presupuestos-preview` | Mediana |
| 9 | Marketing: KPI, mapa, importar, promociones, mover Cuentas por cobrar | `claude/marketing` | Grande |
| 10 | Administración · estructura de grupos y Balance (mover Gastos, Cobros, recurrentes) | `claude/admin-balance` | Mediana |
| 11 | Administración · Cuentas Bancarias con saldos y vínculos | `claude/admin-cuentas` | Mediana |
| 12 | Administración · Compras: órdenes de pago, calificación, comparativa; Consumo Interno | `claude/admin-compras` | Grande |
| 13 | Administración · Contabilidad: Movimientos, Estado de resultados, Situación financiera, Análisis de costo, Resumen de IVA | `claude/admin-contabilidad` | **Grande, esfuerzo medio** |
| 14 | Sucursales: clave por sede, estados de traspaso, reglas, ficha, nueva sucursal, periodo | `claude/sucursales-preview` | Grande |
| 15 | Ajustes · Negocio, Marca, Pagos y Moneda | `claude/ajustes-negocio` | Mediana |
| 16 | Ajustes · Mi Plan: cambio de plan, pago en 3 pasos, capacidad, recargas | `claude/ajustes-plan` | Mediana |
| 17 | Ajustes · Impresión y Datos: impresoras, exportaciones, reporte diario, sin internet | `claude/ajustes-datos` | Mediana |
| 18 | Estadísticas: Pareto, margen, reporte semanal en la app | `claude/estadisticas-preview` | Pequeña |
| 19 | Asistente IA: proveedor gratuito, pestañas, controles, cinco acciones nuevas | `claude/asistente-gratis` | Grande |
| 20 | Learning: quiz, insignias, capítulos, ruta por rol | `claude/learning-preview` | Mediana |
| 21 | Inventario e Inicio: hojas inferiores, ajuste por tipo, barra del plan, proyección | `claude/inventario-inicio` | Pequeña |
| 22 | WhatsApp vinculado por QR desde Marketing (servicio aparte) | `claude/whatsapp-qr` | **Grande, esfuerzo medio** |
| 23 | Revisión final a 390px y 1440px, claro y oscuro, por rol | `claude/revision-final` | Mediana |

Orden: **0 primero**, luego 1, 2 y 3. Todo lo demás depende de la base visual, del selector y de los permisos.

El prompt de cada sesión es el Bloque A de `PROMPT-MAESTRO.md` más la fase. Cada fase se cierra con `node rediseno/visual/comparar.mjs <modulo>`.
