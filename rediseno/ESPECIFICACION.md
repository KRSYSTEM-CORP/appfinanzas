# KR POS · Especificación de rediseño

Objetivo: que el sistema KR POS real quede **igual a la preview "KR POS · Sistema completo"** en lo visual, lo funcional y lo organizacional.

Este documento lo ejecuta Claude Code. Lee primero `CLAUDE-reglas.md`, luego trabaja fase por fase con `BRECHAS-Y-PLAN.md`.

---

## 0. Cómo usar este paquete

| Archivo | Para qué |
|---|---|
| `CLAUDE-reglas.md` | Reglas cortas y obligatorias. Pegar en el `CLAUDE.md` del repositorio. |
| `ESPECIFICACION.md` | Este archivo: qué debe existir y cómo debe comportarse. |
| `PROMPT-MAESTRO.md` | Directrices fijas y prompts por fase para pegar en Claude Code. |
| `PARIDAD-VISUAL.md` | Medidas exactas, diferencias visuales detectadas y cómo verificar con `visual/comparar.mjs`. |
| `BRECHAS-Y-PLAN.md` | Qué le falta hoy al repositorio frente a la preview y el orden de trabajo con su prompt. |
| `tokens.css` | Colores, tipografía, radios, sombras y primitivas, copiados de la preview. |
| `referencia/` | Los 11 HTML originales. Se abren en el navegador para comparar. **No leerlos con la herramienta de lectura: 3 de ellos pesan 300–850 KB por imágenes incrustadas.** |
| `referencia-lectura/` | Los mismos 11 HTML sin las imágenes incrustadas. Estos sí se leen, pero por partes (buscar con grep y leer el tramo). |

### Jerarquía de la verdad
1. La preview **tal como se ve y se comporta en el navegador**.
2. Este documento.
3. El código de la preview.

La preview se construyó por capas: bloques posteriores del mismo archivo redefinen funciones y datos anteriores (aparecen marcados como `AMPLIACIÓN`, `v7`, `v10`, `v13`, etc.). **Siempre vale la última definición.** Ejemplo: en código temprano los planes se llaman Emprende/Negocio/Red; la versión final es Emprende/Pyme/Corporativo.

### Qué NO se copia de la preview
La preview es una maqueta con datos de ejemplo. No pasan a producción:
- Datos ficticios: Boutique Aurora, RIF J-12345678-9, clientes, productos, ventas, proveedores, empleados.
- La fecha fija "miércoles 18 de noviembre de 2026" y la tasa fija 897,54. Usar fecha real y tasa real.
- El panel **Demo** del menú lateral (días para vencer, acelerar inactividad).
- El texto "PIN de ejemplo: …" y "Claves de ejemplo: …".
- El botón **Simular aprobación** del pago de suscripción y **Simular un cobro de $25**.
- Los cupones y descuentos de suscripción distintos al primer mes de Emprende (ver §4).
- `localStorage` como base de datos (`krd`, `krcfg`, `krpay`, `kreqm`, `krpos_plan`). En producción todo va al backend.
- Los `iframe` y `postMessage` entre módulos: son un recurso de la maqueta. En producción son rutas de una sola aplicación con estado compartido.
- Avatares SVG generados y los toasts que dicen "Aquí abre el módulo…".

---

## 1. Sistema visual

Todos los valores están en `tokens.css`. Reglas de uso:

- **Tipografía**: Hanken Grotesk 400/500/600/700/800. Base 14px, interlineado 1.45. Títulos con `letter-spacing` negativo (−.02 a −.035em). Cifras con `font-variant-numeric: tabular-nums`.
- **Color**: fondo `--bg`, tarjetas `--card`, texto `--ink`, texto secundario `--ink2`, marca `--brand` (#433ddd claro / #7b76ff oscuro). Estados con tres niveles cada uno: texto, fondo suave y sólido (ok, warn, bad, info).
- **Modo oscuro**: atributo `data-theme="dark"` en `<html>`. Botón "Modo claro / oscuro" en el menú. Todo componente debe usar variables, nunca hex directo.
- **Radios**: píldora 999px para botones, pills y segmentados; 19px tarjetas y KPI; 24px arriba en hojas inferiores; 14px inputs y controles; 12px chips.
- **Sombras**: `--sh` en tarjetas, `--sh-float` en hojas, toasts y hover de KPI.
- **Movimiento**: 150 ms en hover/active, 250 ms en hojas, curva `--ease`. Botones bajan a `scale(.97)` al presionar. Respetar `prefers-reduced-motion`.
- **Foco**: anillo de 3px color marca, separación 2px.
- **Iconos**: trazo, 24×24, `stroke-width` 2, extremos redondeados (set Lucide). Los `path` exactos están en el objeto `IC` de cada archivo de referencia.
- **Color por módulo**: cada módulo tiene su color (variables `--m-*`). En el menú lateral el icono mide 24px, sin fondo, en el color del módulo; el módulo activo lleva fondo del color del módulo al 15 % y texto del mismo color.

### Componentes base (todos existen en la preview; crear uno reutilizable de cada uno)
| Componente | Descripción |
|---|---|
| Encabezado de página | Eyebrow en mayúsculas + H1 + fila de chips/acciones a la derecha |
| Tarjeta (`card`) | Fondo card, radio 19, sombra, padding 16. Variante `flush` sin padding para tablas |
| KPI (`kpi`) | Etiqueta en mayúsculas 12px, número 30px, pista 13px, icono circular arriba a la derecha. Variantes all/ok/warn/bad. Es botón: filtra o navega |
| Botón (`btn`) | Altura 40, píldora. Variantes: normal (fondo fill, texto marca), `primary`, `danger`. CTA grande de 48–52 |
| Pill | Estado corto. Variantes neutro, val, ok, warn, bad |
| Chip | Filtro seleccionable, radio 12, borde 2px marca cuando está activo |
| Segmentado (`seg`) | Selector de 2–5 opciones en píldora |
| Selector de grupo (`gp`) | Tarjetas horizontales con icono, título y subtítulo; la activa va en color marca. Navegación interna de Administración y Ajustes |
| Tabla | Dentro de `card flush`, fila de totales, columnas numéricas a la derecha, menú ⋯ por fila |
| Menú ⋯ | Acciones por fila (ver, editar, imprimir, eliminar…). Se cierra con clic afuera y con Escape; navegable con teclado |
| Hoja inferior (`sheet`) | Todo formulario, detalle y confirmación abre en hoja que sube desde abajo, ancho máx. 560, con fondo oscurecido. Cierra con Escape y con clic en el fondo |
| Confirmación destructiva | Hoja con título en pregunta, consecuencia explicada y botón "Sí, …" |
| Toast | Píldora oscura abajo al centro, una línea, desaparece sola |
| Campo (`fld`) | Etiqueta arriba, input de 50px, radio 14, fuente 16px (evita zoom en iPhone) |
| Barra de periodo | Segmentado Hoy · 7 días · Mes · Meses · Rango + etiqueta del periodo (ver §3.3) |
| Kit de documentos | Vista previa + Ticket 58 mm / Ticket 80 mm / Hoja carta + Imprimir / Descargar PDF / Enviar por WhatsApp (ver §3.4) |
| Gráficos | SVG propio: barras, barras horizontales, dona de meta, cascada, embudo, mapa de calor, Pareto. Colores `--c1…--c7` |
| Estado vacío | Texto centrado gris dentro de la tarjeta ("No hay … con ese filtro") |

---

## 2. Estructura general (shell)

### 2.1 Navegación
- **Computadora (≥ 960px)**: riel lateral fijo de 260px.
  - Arriba: logo "KR" en cuadro marca + nombre del sistema + nombre del negocio.
  - Chip **Sede activa** con el nombre de la sede.
  - Módulos en 3 grupos con título en mayúsculas.
  - Abajo: pill del plan ("Plan Pyme · 5 usuarios"), pill de tasa ("Tasa Bs …"), botón **Bloquear pantalla**, avatar + nombre + rol del usuario.
- **Teléfono (< 960px)**: barra inferior fija de 5 posiciones. La del centro es un botón circular elevado de 54px color marca. La quinta es **Más**, que abre una hoja con la cuadrícula de todos los módulos (3 columnas), más "Modo claro / oscuro" y "Bloquear pantalla".
  - Orden por defecto: Inicio · Inventario · **POS** (centro) · Presupuestos · Más.
  - Si el usuario no tiene permiso para alguno, se sustituye por el siguiente módulo permitido (ver función `bk()` en la referencia 00).

### 2.2 Módulos y grupos (orden exacto)
| Grupo | Módulo | Ruta sugerida | Color | Permiso requerido |
|---|---|---|---|---|
| Operación | Inicio | `/inicio` | #433ddd | — (todos) |
| Operación | POS | `/pos` | #0f9d9a | Punto de venta |
| Operación | Inventario | `/inventario` | #ff9f0a | Inventario |
| Operación | Presupuestos | `/presupuestos` | #7a3ff2 | Punto de venta |
| Control | Caja Chica | `/caja` | #34c759 | Caja Chica |
| Control | Estadísticas | `/estadisticas` | #d6407f | Estadísticas |
| Control | Marketing | `/marketing` | #e0409a | Administración |
| Control | Administración | `/administracion` | #1d4ed8 | Administración |
| Red y plataforma | Sucursales | `/sucursales` | #c2410c | Sucursales |
| Red y plataforma | Asistente IA | `/asistente` | #6655e5 | Asistente IA |
| Red y plataforma | Learning | `/learning` | #0f7a8a | — (todos) |
| Red y plataforma | Ajustes | `/ajustes` | #6e6e73 | Ajustes y suscripción |

Un módulo sin permiso no aparece en el menú y su ruta redirige a Inicio.

### 2.3 Acceso: correo → usuario → PIN
Tarjeta de acceso de dos columnas (máx. 980px, radio 32): a la izquierda panel degradado morado con carrusel de 4 mini-maquetas (POS, Inventario, Ganancia, Presupuestos) que rota cada 3,6 s; a la derecha el formulario. En teléfono (< 820px) queda una sola columna y el carrusel se oculta. Pie: **Soporte** con WhatsApp y correo.

Flujo:
1. **Bienvenido**: correo + clave, "Entrar", "Continuar con Google", enlaces "Crear cuenta" y "¿Olvidaste tu contraseña?".
   - Al escribir el correo, si pertenece a un negocio registrado, el logo y el color del formulario cambian a los de ese negocio (marca del cliente).
2. **Crea tu cuenta**: nombre del negocio, correo, clave → pantalla de planes. Texto: "15 días gratis. Sin tarjeta."
3. **Recupera tu clave**: correo → "Enlace enviado a …".
4. **Elige tu plan** (solo cuentas nuevas): 3 tarjetas, la del medio marcada "Más elegido".
5. **¿Quién eres?**: cuadrícula de usuarios del negocio con foto, nombre y rol. Todo el equipo entra con el mismo correo y clave; después cada persona toca su usuario.
6. **PIN**: 4 dígitos, teclado numérico en pantalla y también por teclado físico. PIN incorrecto: los puntos tiemblan y dice "PIN incorrecto". Al tercer fallo: "Demasiados intentos. Espera unos segundos."

### 2.4 Bloqueo de pantalla
- Se bloquea por inactividad según el rol (minutos, configurable en Ajustes): Dueño 10, Administrador 10, Gerente 5, Cajero 5, Vendedor 5, Contador 10.
- 15 segundos antes aparece un aviso arriba: "Se bloqueará en N s" + botón **Seguir aquí**.
- También se bloquea a mano con "Bloquear pantalla".
- Pantalla de bloqueo a pantalla completa con degradado morado→rosa, reloj grande, fecha, lista de usuarios en tarjetas de vidrio esmerilado y "Cerrar sesión". Al tocar un usuario pide su PIN con teclado de vidrio.
- Al desbloquear, vuelve al módulo donde estaba si el usuario que entra tiene permiso; si no, a Inicio.

### 2.5 Aviso de renovación
- Solo lo ve el **Dueño**, cuando faltan 5 días o menos para vencer el plan.
- Tarjeta flotante abajo a la derecha (en teléfono, sobre la barra inferior). Naranja; roja cuando falta 1 día o vence hoy.
- Textos: "Te quedan N días para renovar" / "Mañana vence tu plan" / "Tu plan vence hoy".
- Tocarla lleva a Ajustes → Mi Plan. Tiene X para cerrarla.

### 2.6 Cambio de sede
Al entrar a otra sede: animación a pantalla completa del color de la sede con "Sede anterior → Sede nueva · Entrando a la sede…" (1,8 s). Luego todos los módulos muestran datos de esa sede, el chip "Sede activa" parpadea y se vuelve a Inicio.

---

## 3. Reglas transversales

### 3.1 Roles y permisos
Lista de permisos (12): Punto de venta · Inventario · Compras y proveedores · Clientes (CRM) · Administración · Estadísticas · Caja Chica · Sucursales · Asistente IA · Ajustes y suscripción · Anular ventas · Ver costos y ganancias.

| Rol | Permisos por defecto |
|---|---|
| Dueño | Todos. Único que ve el aviso de renovación |
| Administrador | Todos |
| Gerente | Todos menos "Ajustes y suscripción" |
| Cajero | Punto de venta, Caja Chica, Clientes (CRM) |
| Vendedor | Punto de venta, Clientes (CRM) |
| Contador | Definir en Ajustes (rol existente, permisos editables) |

- Se pueden crear roles nuevos con nombre y permisos elegidos, y editar los permisos de cada rol (Ajustes → Equipo y Seguridad).
- **Los permisos se validan en el servidor**, no solo ocultando botones.
- "Ver costos y ganancias" apagado: ocultar costo, margen y ganancia en toda la interfaz.
- "Anular ventas" apagado: no aparece la acción Anular.

### 3.2 Moneda y tasa
- Moneda base: dólares (opción euros). Todo precio se guarda en la moneda base.
- Tasa BCV diaria. **Tasa automática**: se actualiza sola; a las 7:00 p. m. toma la tasa del día siguiente y la activa a las 12:00 a. m. de su fecha valor. Verificación nocturna contra el BCV. Alternativa: **fijar tasa manualmente** (desactiva la automática hasta reactivarla).
- Regla de presentación: **los métodos en bolívares se muestran y cobran en Bs; los métodos en divisa se muestran en $ con su referencia en Bs**.
- Cada pago y cada abono guarda la tasa del momento.
- Formato: `$1.120,00` y `Bs 897,54` (punto de miles, coma decimal).
- **IGTF 3 %** sobre pagos en divisas, activable/desactivable en Ajustes. **IVA 16 %** solo en documentos fiscales.

### 3.3 Selector de periodo (mismo componente en Inicio, POS, Presupuestos, Sucursales, Estadísticas, Administración, Caja Chica)
- Segmentado: **Hoy · 7 días · Mes · Meses · Rango**.
- **Rango**: hoja con calendario. Se toca el día inicial y luego el final (o se aplica un solo día). Atajos: Ayer, Esta semana, Semana pasada, 1.ª quincena, 2.ª quincena, Mes pasado.
- **Meses**: hoja con los 12 meses para sumar varios. Atajos: Este mes, Últimos 3 meses, Últimos 6 meses, Todo el año. Los meses futuros salen deshabilitados ("Aún no"); el mes actual dice "En curso".
- La etiqueta del periodo se muestra junto al selector ("Hoy · …", "Últimos 7 días · …", "Noviembre · día 18 de 30", "Del … al … · N días").
- Los gastos fijos se **prorratean por días** al calcular ganancia de un periodo parcial.

### 3.4 Kit de documentos (un solo módulo reutilizado)
Usado por: venta, nota de entrega, recibo de abono, presupuesto, Corte Z, cierre de caja, recibo de nómina, comprobante de compra, notas de crédito/débito.
- Hoja con **vista previa** del documento.
- Formato: **Ticket 58 mm · Ticket 80 mm · Hoja carta**.
- Acciones: **Imprimir · Descargar PDF · Enviar por WhatsApp** (pide número, valida, adjunta el PDF).
- Encabezado: logo y nombre del negocio, RIF, dirección. Pie: "Documento generado con KR POS · Tasa del día …". Incluye total en $ y "En bolívares".
- Hoja carta: tabla Descripción / Cant. / Precio / Importe y línea "Recibí conforme".
- Usa el logo y la paleta definidos en Ajustes → Marca.

### 3.5 Fórmula única de ganancia
**Ganancia neta estimada = Ventas − Costo de mercancía vendida − Gastos − Comisiones**, para el periodo elegido. En Inicio se calcula solo con las ventas de los días que ya tienen cierre de caja (regla actual del sistema, se mantiene). Siempre con ese nombre ("estimada"). La misma cifra en Inicio, Administración → Resumen, Sucursales y el Asistente. Comisión de vendedores por defecto: 3 % de las ventas.

### 3.6 Estados de inventario
**Disponible** (verde) · **Stock bajo** (naranja: en o por debajo del mínimo) · **Agotado** (rojo: 0) · **Inactivo**. Mismos colores y nombres en todo el sistema.

### 3.7 Reglas de negocio que no se pueden romper
1. Un **presupuesto no descuenta inventario** hasta convertirse en venta.
2. Una venta **con factura fiscal no se anula**: se corrige con nota de crédito. Las notas de entrega sí se anulan.
3. **Anular** una venta: queda tachada, marcada "Anulada", deja de sumar y **devuelve el producto al inventario**.
4. El **cliente general no puede comprar a crédito**: exige cliente registrado.
5. Venta a crédito: el saldo pasa a **Cuentas por cobrar** del cliente. Cada abono guarda fecha, método, referencia y tasa, y genera recibo.
6. Descuento del 100 % = **venta exonerada**: total $0, no pide método de pago, exige motivo.
7. **Consumo interno** (retiros de socios o personal): no es venta, no suma ingresos, descuenta inventario al costo.
8. Compra registrada: **suma al inventario**; si es a crédito, va a Cuentas por pagar.
9. Cada sede tiene su propia caja, su Corte Z y su numeración de documentos.
10. Límites del plan (usuarios, productos, créditos) se cuentan desde que se elige el plan; al llegar al límite se bloquea crear más y se ofrece cambiar de plan.
11. El Asistente IA **nunca aplica un cambio sin confirmación**: primero muestra la propuesta y su costo.

---

## 4. Planes, límites y créditos

| | Emprende | Pyme (Más elegido) | Corporativo |
|---|---|---|---|
| Precio mensual | $12,99 (**primer mes $10**, único descuento del sistema) | $23,99 | $44,99 |
| Usuarios | 3 (dueño o gerente + 2 vendedores) | 5 | 10 |
| Productos | 200 | 500 | Ilimitados |
| Créditos IA incluidos | 0 (consultar es gratis) | 100 | 200 |
| Contabilidad | **No** (bloqueada con candado "Desde el plan Pyme") | Sí | Sí |
| Extra | — | — | Un módulo personalizado por mes |

- Prueba: **15 días gratis**, sin tarjeta. Aviso 5 días antes de vencer.
- Recargas de créditos IA (pago único, no vencen), con etiqueta de ahorro: 50 → $5 · 100 → $9 "Ahorra 10 %" · 250 → $20 "Ahorra 20 %" y "Más popular" · 500 → $35 "Ahorra 30 %" · 1.000 → $60 "Mejor valor · −40 %".
- Costo del Asistente: consultar y ver propuestas es gratis (10 consultas al día gratis, luego 5 créditos); **aplicar un cambio cuesta 5 créditos**; deshacer en 24 h es gratis.
- Pago de la suscripción: con comprobante (ver §5.11). Se calcula a la tasa BCV del día.
- Los precios y límites deben vivir en una **tabla de configuración**, no en el código.

### Descuentos de suscripción (decisión del dueño, sin excepciones)
- **El único descuento que existe es: plan Emprende, primer mes a $10.** Desde el segundo mes, $12,99.
- Pyme y Corporativo no tienen descuento en ningún mes.
- **Eliminar de la interfaz y del código todo lo demás que la preview muestra como descuento de suscripción:**
  - el texto "primera mensualidad con 50 % de descuento" y la tarjeta "Tu bienvenida tiene beneficios";
  - la línea "Descuento de bienvenida" del resumen de pago (se sustituye por "Primer mes · plan Emprende" solo cuando aplica);
  - el campo **Código de descuento / Cupón**, el cupón `LANZAMIENTO20` y la tabla de cupones;
  - cualquier "Nuevos usuarios · solo el 1.er mes" que no sea el de Emprende.
- No confundir con los descuentos de venta del POS (5/10/15/20 %, otro, exonerada) ni con las promociones de Marketing: esos son del negocio hacia sus clientes y se mantienen.

---

## 5. Módulos

Para cada módulo: abrir el HTML en `referencia/` y replicar pantalla por pantalla. Aquí va el inventario de lo que debe existir.

### 5.1 Inicio (`01-inicio.html`)
- Encabezado: fecha + sede. Selector de periodo.
- Tarjeta principal **Ganancia neta estimada** con desglose Ventas / Costo / Gastos / Comisiones y % de margen.
- Accesos rápidos: **Vender** (POS) · **Presupuesto** (Nuevo) · **Cuentas por cobrar** (monto por cobrar) · **Caja Chica** (estado "Abierta 8:02") · **Inventario** (N alertas).
- **Lo que no puede esperar**: avisos accionables del día (stock crítico → Ver inventario; cuentas vencidas → Ver cuentas; presupuesto por vencer sin abrir → Dar seguimiento).
- **Ventas por hora** (barras; indica la hora pico).
- **Meta del mes**: dona con % de avance, "Faltan $…", proyección "A este ritmo cierras el mes en $…".
- **Lo más vendido** (top 5 con barra).
- **Últimas ventas**: cliente, método, monto (Bs o $ con referencia) y saldo si debe.

### 5.2 POS (`02-pos.html`)
Diseño: en computadora dos columnas (catálogo a la izquierda, venta actual a la derecha); en teléfono el catálogo ocupa la pantalla y un botón "Ver venta actual" abre el carrito.

- **Barra superior**: negocio, tasa, estado "Caja abierta", indicador Online/sin conexión.
- **Catálogo**: buscador, chips de categoría (Todos + categorías), tarjetas de producto con precio en $ y Bs; "Agotado" deshabilitado; no deja agregar más que el stock ("Solo hay N").
- **Venta actual**:
  - Canal: **Mostrador · Delivery · Pick-up · Online**.
  - **Cuentas** múltiples abiertas (Cuenta 1, 2… + "Nueva cuenta"; eliminar cuenta con confirmación).
  - **Cliente de esta venta**: genérico por defecto; botones **Registrar cliente** y **Directorio**.
  - Líneas con +/−, Subtotal, Descuento, Total estimado y Equivalente en Bs.
  - **Vaciar**, **En espera** (ventas en espera para retomar) y **Cobrar**.
- **Registrar cliente**: Nombre*, Apellido*, Cédula, Teléfono*, Dirección*, Fecha de nacimiento, Correo. Se guarda en el CRM y se usa en la venta.
- **Directorio de clientes**: búsqueda, estado "Debe $…" o "Al día", opción "Cliente general".
- **Cobro**:
  - Modo: **Completo · Fraccionado · A crédito**.
  - Métodos: Pago Móvil, Punto de venta, Transferencia, Efectivo Bs, Efectivo $, Zelle, Binance (agrupados Bolívares / Dólares, marca "Más usado hoy"). Solo aparecen los activos en Ajustes.
  - Por método: monto en su moneda; en efectivo, "El cliente entrega" → **Vuelto** o "Faltan"; botón "Exacto"; en electrónicos, referencia (últimos 6 dígitos).
  - Fraccionado: "Agregar este pago", lista de pagos, **Saldo pendiente** / **Cubierto**.
  - **IGTF 3 %** automático sobre el pago en divisas (si está activo).
  - **Descuento y documento**: Sin / 5 % / 10 % / 15 % / 20 % / Otro descuento (monto en $ o porcentaje). 100 % = exonerada con motivo.
  - Documento: **Nota de entrega · Ticket rápido de caja · Factura fiscal** (sombreada, con candado y "Próximamente"; no se puede elegir).
  - "Estado tras este cobro": Cierra y salda / Queda en Cuentas por cobrar / Exonerada / Falta $….
  - **Datos para cobrar**: muestra las cuentas vinculadas al método (banco con logo, teléfono, cédula/RIF, titular) con **Copiar datos** y envío por WhatsApp.
  - **Mostrar al cliente**: pantalla para el cliente con total, tasa del día y QR con los datos de pago.
- **Venta registrada**: N.º, vuelto entregado, **Imprimir o compartir** (kit de documentos), **Nueva venta**.
- **Ventas del día / del periodo**: lista con selector de periodo, filtros por estado (Todos, Pagadas, A crédito, Anulada) y método; columnas N.º, Hora, Cliente, Canal, Método, Total, Estado; "Ver más ventas". Menú ⋯: **Ver detalle** (cómo pagó, referencia, tasa, abonos), **Imprimir o compartir**, **Registrar abono**, **Volver a vender**, **Anular venta** (con permiso).

### 5.3 Inventario (`03-inventario.html`)
- KPI que filtran: **Total de productos · Disponibles · Stock bajo · Agotados**. Tarjeta **Valor del inventario**.
- Barra de uso del plan: "N de 200 productos · Plan Emprende" (o "Ilimitados").
- Buscador + filtro de categorías. Lista: nombre, SKU, categoría, stock, mínimo, costo, precio, valor, estado.
- Banner "N productos necesitan reposición" → **Lista de reposición**: cantidades sugeridas para llegar al doble del mínimo, costo estimado, **Crear orden de compra**.
- Menú ⋯ por producto: **Editar producto · Movimientos · Activar/Desactivar · Eliminar**.
- **Editar producto**: Nombre, SKU, Categoría, Costo, Precio, Stock mínimo y **Sumar existencias** ("Escribe cuántas unidades llegaron. Las ventas descuentan solas").
- **Ajuste de existencias**: Entrada (compra o devolución) · Salida (merma, daño o robo) · Conteo físico; cantidad y nota.
- **Movimientos** del producto: compra, venta, ajuste, con fecha y saldo resultante.
- Carga y actualización masiva por **Excel** con plantilla.
- Eliminar: confirmación "irreversible"; las ventas y presupuestos ya generados no se afectan.

### 5.4 Presupuestos (`04-presupuestos.html`)
- KPI: Abiertos · Convertidos · Perdidos · **Tasa de conversión**. Selector de periodo.
- **Embudo de seguimiento**: Creados → Enviados → Vistos → Convertidos.
- **Por qué se pierden**: monto perdido por motivo (Precio, Compró en otro lado, No respondió, Cambió de idea).
- Lista con filtro por estado: **Pendiente · Visto · Convertido · Perdido**. Cada tarjeta: N.º, cliente, total, vigencia ("Vence en N días" / "Vencido hace…"), vendedor y **sugerencia de siguiente paso** ("Aún no lo abre: reenvía por WhatsApp…", "Está por vencer: llama hoy…").
- **Nuevo presupuesto**: cliente, productos con cantidad, vigencia (7/15/30 días), descuento, nota para el cliente → "Crear y enviar por WhatsApp" o "Guardar".
- **Detalle**: líneas, total, **Historial y seguimiento** (creado, enviado, abierto, llamadas, notas), **Registrar seguimiento** (Llamé / Escribí por WhatsApp / Nota) y **Recordarme en** N días.
- Acciones: **Facturar** (abre el POS con los productos precargados y marca "Facturado como venta #…") · **Enviar por WhatsApp** · **Imprimir o compartir** · **Duplicar** · **Marcar perdido** (pide motivo) · **Eliminar**.
- Documento: "Presupuesto sin valor fiscal… VÁLIDO HASTA EL …".

### 5.5 Caja Chica (`05-…html#caja`)
- Encabezado "Cierre y control del turno" + tasa + fecha.
- **Estado de la caja**: Abierta desde las HH:MM / Cerrada. **Abrir caja** con saldo inicial por método de pago; **Ajustar apertura**.
- Mini tarjetas: Ventas del día · Efectivo esperado · Salidas.
- **Ventas del día** (lo primero): misma lista del POS con canal, estado y método.
- **Movimientos de Caja Chica**: entradas y salidas del turno; **Registrar salida** (concepto, monto).
- **Cerrar caja**: se escribe **solo el total contado** en $ y en Bs (sin desglose por billetes) → compara con el esperado → **Caja cuadrada / Sobrante / Faltante** → genera el **Corte Z**.
- **Corte Z**: negocio, RIF, fecha, cajero, turno, apertura, ventas por método, egresos, esperado, contado, diferencia, N.º de ventas, total. Con kit de documentos.
- **Días pendientes por cerrar**: lista de días sin cierre con "Cerrar día" (genera el Corte Z de ese día).
- **Cierres de caja** (historial, abre como vista aparte con "← Volver a Caja Chica"): por periodo; menú ⋯ → Ver cierre (ingresos por método), Ver Corte Z.

### 5.6 Estadísticas (`05-…html#est`)
- "Qué está pasando en tu tienda". Selector de periodo.
- KPI: Ventas · Pedidos (ventas pagadas) · Venta promedio · Clientes nuevos.
- **Distribución de ventas** por monto de compra · **Ventas por categoría** · **Ventas por vendedor** · **Clientes nuevos y recurrentes**.
- **Mapa de calor**: ventas por día y hora (promedio de las últimas 8 semanas).
- **Rendimiento de productos**: Pareto 80/20 con conmutador Más vendidos / Menos vendidos.
- Tarjetas: **Más vendidos** (Líder) · **Menos vendidos** (candidatos a promoción) · **Lo que más compramos** · **Mayor rotación** (días de inventario; Reponer / Vigilar / Cubierto).
- **Costos y rentabilidad**: margen por producto.
- **Punto de equilibrio** general y **por categoría / por producto**, con buscador y **Meta de ganancia** editable por empresa.
- **Lo que dicen tus números**: hallazgos automáticos con botón de acción.
- **Reporte semanal automático** (se genera cada lunes 6:00 a. m.): elegir meses, ver reporte, descargar en Excel.

### 5.7 Marketing (`05-…html#mkt`)
- "Clientes, promociones y cumpleaños" (CRM).
- KPI: Registrados · Frecuentes (6 visitas o más) · Inactivos (más de 45 días) · Cumpleañeros.
- Interruptor **Exigir nombre y teléfono en cada venta**.
- Tarjeta **WhatsApp**: estado Conectado / Desconectado, número vinculado, "Conectar WhatsApp" (hoja con código QR) y "Desvincular". Es el único lugar donde se vincula.
- **Importar Excel** + **Plantilla** + **Añadir cliente** + buscador.
- **Mapa de clientes** (cuadrantes por frecuencia y gasto): Campeones · Leales · En riesgo · Dormidos. Tocar un cuadrante filtra la tabla.
- **Agenda de contactos** y **Próximos cumpleaños** (promo por WhatsApp o correo).
- Tabla: Cliente, Visitas, Gastado, Última visita, Próximo contacto, Grupo. Menú ⋯: Editar ficha, Notas y próximo contacto, WhatsApp, Eliminar.
- **Decisión del dueño: todo lo relacionado con clientes vive en Marketing y solo ahí.** Sub-pestañas: **Clientes · Promociones · Cuentas por cobrar**. Administración no tiene grupo de clientes. Las vistas están en la referencia 05 (`vCli`, `vPromo`, `vCobrar`). El acceso "Cuentas por cobrar" de Inicio y el registro de clientes del POS apuntan a este módulo.
- **Promociones**: elegir lista de clientes, descuento, vigencia → código generado + vista previa del WhatsApp; códigos activos y **Registrar canje**.
- **Cuentas por cobrar**: Por cobrar, Vencido, antigüedad (0-30 / 31-60 / más de 60 días), tabla por cliente, **Registrar abono**.

### 5.8 Administración (`05-…html#adm`)
Navegación interna con tarjetas de grupo y sub-pestañas:

| Grupo | Sub-pestañas |
|---|---|
| **Balance** | Resumen · Cobros · Gastos |
| **Cuentas Bancarias** | Cuentas |
| **Compras** | Registro de compras · Proveedores · Órdenes de pago · Calificación |
| **Consumo Interno** | Retiros |
| **Contabilidad** (candado en Emprende) | Movimientos · Estado de resultados · Situación financiera · Análisis de costo · Nómina · Libro de ventas · Libro de compras · Resumen de IVA |

- **Resumen**: Ganancia neta estimada, KPI Ventas / Costo / Gastos / Comisiones, **Cascada de ganancia**, **Punto de equilibrio** y proyección de cierre de mes.
- **Cobros**: cobros por método, total cobrado.
- **Gastos**: total del mes, por categoría (Alquiler, Nómina, Servicios públicos, Mercadeo, Otros), filtros por categoría y periodo, **Agregar gasto**, editar/eliminar, **Gastos recurrentes** con aviso 5 días antes del vencimiento y "Registrar ahora".
- **Cuentas Bancarias**: saldo por cuenta (logo del banco), total en $ y Bs, **Agregar cuenta** (lista de bancos venezolanos), **Vincular métodos de pago a cuentas** (varias cuentas por método; el saldo sube solo al cobrar), **Datos para cobrar** por cuenta (banco, teléfono Pago Móvil, cédula/RIF, titular, N.º de cuenta, correo Zelle, Binance ID).
- **Registro de compras**: KPI Comprado / Por pagar / Proveedores; **Sugerencia de compra** por stock bajo; **Registrar compra** (proveedor o "Otro proveedor", N.º de factura, productos comprados vinculados al inventario o "Producto nuevo…", cantidad, costo unitario, IVA o Exento, De contado / A crédito, **Fraccionar pago**, ¿factura fiscal?). Lista más reciente primero; anuladas tachadas. Menú ⋯: Ver, Editar, Registrar pago, Imprimir, Anular.
- **Proveedores**: Nuevo proveedor (nombre, RIF, teléfono), Debe / Al día, Ver compras, Editar, Eliminar. **Comparativa de último costo** del mismo producto entre proveedores.
- **Órdenes de pago**: Cuentas por pagar; marcar varias facturas → **Crear orden de pago** (OP-…); marcar pagada.
- **Calificación**: estrellas por Calidad, Precio, Puntualidad y Atención; promedio.
- **Consumo Interno**: KPI Socios / Personal / costo real retirado; "Quién retira más"; **Agregar retiro** (quién, Socio o Personal, producto con buscador como en el POS, cantidad); editar y eliminar.
- **Movimientos**: Ingresos, Egresos, Flujo neto; filtro por tipo; los "Auto" vienen de Compras y Gastos; **Añadir ingreso** manual; Exportar Excel.
- **Estado de resultados**: Ingresos por ventas → Costo de ventas → Utilidad bruta → Gastos de ventas → Gastos de administración → Resultado de operación → Otros ingresos → ISLR estimado → Resultado neto. Cada línea con **"?" (Traductor contable)** que la explica en palabras simples. ISLR con tasa de ejemplo 15 %, configurable.
- **Situación financiera** (estilo NIIF): Activo corriente, Pasivo corriente, Patrimonio; ecuación Activo = Pasivo + Patrimonio con indicador "Cuadra"; **Semáforo de razones** (Liquidez, Margen neto, Endeudamiento).
- **Análisis de costo**: compras frente a costo de ventas, a dónde fue la mercancía (ventas, mermas, consumo interno, **desviación sin explicar**).
- **Nómina**: empleados (cargo, sueldo base, participación en comisión, bonos), deducciones y aporte patronal (porcentajes configurables), provisiones (utilidades, vacaciones), calendario de quincenas, **Pagar nómina** (toda o por empleado; métodos, referencias y comprobantes adjuntos), adelantos, **Recibo de pago**, historial de pagos, dar de baja.
- **Libro de ventas / Libro de compras / Resumen de IVA**: base imponible, IVA 16 %, débito y crédito fiscal, IVA a pagar; cargar factura; solo documentos fiscales (las notas de entrega no entran). **Nota de crédito** y **Nota de débito** sobre una factura, con impresión al emitir.

### 5.9 Sucursales (`06-sucursales.html`)
- Vista consolidada: Ventas de la red · Ganancia neta estimada · Mejor sede. Selector de periodo.
- **Alertas de toda la red**.
- Tarjeta por sede: estado (Operando aquí / Abierta desde … / Sin abrir hoy / Nueva), ventas, ganancia, pedidos, **Meta del mes**, "Ver ficha", **Entrar a esta sede** / **Entrar con clave**.
- **Acceso por sede**: cada sede se abre con la **clave de 4 dígitos de su administrador**; 3 intentos; "Bloquear las demás"; cambiar la clave (actual + nueva).
- **Comparativa entre sedes**: Ventas, Costo, Gastos, Comisiones, Ganancia neta, Margen, Venta promedio, y "Red completa".
- **Traspasos entre sedes**: sugerencias automáticas (sobra en una, falta en otra), **Crear traspaso**, estados **Solicitado → En camino → Recibido**.
- **Reglas de la red** (interruptores): Inventario compartido · Casa Matriz · Precios distintos por sede · Tasa del día única.
- **Ficha de sede**: encargado, caja, equipo activo, ventas del periodo, rotación, próxima numeración (Venta, Factura, Presupuesto PRE-, Nota de crédito NC-).
- **Nueva sucursal**: nombre, ciudad o zona, catálogo inicial (vacío / copiar de otra sede), "Inventario en cero", clave del administrador.
- Acciones: editar nombre y encargado, WhatsApp de la sede, copiar catálogo a otra sede, desactivar (no se puede desactivar la sede donde se opera; el historial se conserva).

### 5.10 Asistente IA (`07-asistente-ia.html`)
Tres pestañas: **Asistente · Créditos · Historial**.
- **Asistente**: chat con accesos rápidos:
  1. Preparar el inventario desde Excel
  2. Ajustar precios en lote (por categoría o porcentaje; límite 1–50 %)
  3. Recordatorios de cobro por WhatsApp
  4. Promoción para clientes dormidos (límite 1–60 %)
  5. Armar un presupuesto
  6. Explícame mi ganancia del mes
- Flujo obligatorio: el asistente responde con una **tarjeta de propuesta** (qué cambia, antes → después, advertencias) + "Costo para aplicar" + botones **Aplicar · 5 créditos** y **Descartar**. Nada se ejecuta hasta confirmar.
- Entrada por texto y **dictado por voz** (convierte números hablados; mensajes claros si no hay micrófono o permiso).
- Rol: "Como vendedor puedes consultar, pero no aplicar cambios".
- Sin créditos: hoja "No tienes créditos" → Recargar.
- **Créditos**: saldo (dona), Incluidos en tu plan / Comprados / Usados este mes, **Recargar créditos**. **Controles**: Tope mensual, "Solo el gerente aplica cambios", "Deshacer por 24 horas". Tabla **Cómo se cobra**.
- **Historial**: quién pidió qué, cuándo, costo, estado (Aplicado / Deshecho) y botón **Deshacer**.

### 5.11 Ajustes (`10-ajustes.html`)
Secciones: **Todo en una vista · Mi Plan · Marca · Negocio · Pagos y Moneda · Equipo y Seguridad · Impresión y Datos**.
- **Preparación para estar al 100 %**: guía de 6 pasos con barra de avance (Datos y RIF · Moneda y tasa · Métodos de pago · Equipo y PIN · Impresora y ticket · Marca en documentos), cada uno Listo/Pendiente con botón "Completar".
- **Mi Plan**: plan activo o periodo de prueba, próximo cobro, **Capacidad de tu plan** (Usuarios, Sedes, Productos, Créditos IA con barra de uso), plan recomendado, **Cambiar de plan**, **Recarga de créditos**, **Historial de pagos**, "Solicitar demo / cotización".
- **Pago de suscripción** (3 pasos): ① método (en bolívares o en divisa) y aceptar condiciones (sin campo de cupón) → ② datos para pagar con monto exacto, tasa bloqueada y botón Copiar (los datos de cobro los define solo el administrador de KR System) → ③ nombre, teléfono, correo, **número de referencia** y **comprobante** (JPG/PNG/WebP, hasta 10 MB). Estados: **Reportado → En revisión (hasta 2 h hábiles) → Aprobado**. El comprobante llega al administrador de KR System por WhatsApp y correo. La activación la aprueba el administrador desde su panel.
- **Marca**: subir logo, paletas recomendadas a partir del logo, color principal y acento, vista previa en ticket y presupuesto.
- **Negocio**: nombre comercial, RIF, país, WhatsApp, Instagram, dirección. **Sin horario de atención** (decisión del dueño).
- **Pagos y Moneda**: moneda base, tasa (ver §3.2), **Métodos de pago** (activar/desactivar, moneda de cada uno, datos cargados o no, Editar), **Impuestos y cargos** (IVA, IGTF, cargo por servicio).
- **Equipo y Seguridad**: lista de usuarios, **Registrar nuevo integrante** (nombre, rol, PIN de 4 dígitos), editar rol/PIN/restablecer clave, **roles y permisos** (matriz editable y "Crear un rol nuevo"), **Clave de pantalla** con minutos de inactividad por rol y "Probar bloqueo", **Claves de administrador por sede**, **Fotos de acceso** (foto por persona; imagen por rol como respaldo), Cambiar mi PIN, Cerrar sesión. Crear usuario respeta el límite del plan.
- **Impresión y Datos**: impresoras (Ticket 80 mm principal, 58 mm reserva, Hoja carta) con "Imprimir prueba"; **exportaciones a Excel** (respaldo de cobros, historial de ventas); **Reporte diario por correo** (hasta 5 correos, hora de envío); **Modo sin internet**: se usa el que ya existe en el sistema; aquí solo se muestra su estado.

### 5.12 Learning (`08-learning.html` y `09-learning-admin.html`)
- "Academia KR POS". Módulos en video con **ruta sugerida por rol** (Dueño, Vendedor, Cajero, Contador) y filtro "Para ti / Todo".
- Cada módulo: video, capítulos, "Lo que aprendes", estado **Visto / Completado**, **Hacer el quiz** (aprobar da la insignia), **Practicar en mi sistema**, **Preguntar al Asistente IA**.
- Progreso por usuario con anillo de avance e insignia final "Experto KR POS".
- 11 módulos iniciales: Configura tu negocio · Cargar productos y categorías · Vender en el punto de venta · Cobrar en bolívares y en divisas · Inventario y alertas · Compras, proveedores y presupuestos · Clientes y CRM · Caja, Corte Z y Caja Chica · Administración y ganancia neta estimada · Sucursales con clave · Asistente IA y créditos.
- **Modo administrador de la plataforma** (solo el superadministrador de KR System, definido por configuración del servidor): subir video (hasta 500 MB, máximo 10 videos), título, resumen, ruta sugerida, puntos clave, Publicado/Borrador, reemplazar, ocultar, eliminar; métricas "Empresas que aprenden" y "Finalización promedio". Lo publicado lo ven todas las empresas.

---

## 6. Modelo de datos mínimo

Adaptar a lo que ya exista en el repositorio; no duplicar tablas. Todas las tablas de negocio llevan `empresa_id` y, donde aplique, `sede_id`.

`empresas` (nombre, RIF, logo, paleta, país) · `sedes` (clave de administrador con hash, numeraciones, meta mensual, activa) · `usuarios` (rol, PIN con hash, foto, activo) · `roles` + `rol_permisos` · `planes` + `suscripciones` + `pagos_suscripcion` (referencia, comprobante, estado) · `tasas` (fecha valor, valor, fuente, manual) · `metodos_pago` (moneda, activo) · `cuentas_bancarias` + `metodo_cuenta` (vínculo) · `categorias` · `productos` (sku, costo, precio, mínimo, activo) · `existencias` (producto × sede) · `movimientos_inventario` (tipo: compra, venta, ajuste, traspaso, consumo, anulación) · `clientes` (nacimiento, notas, próximo contacto) · `ventas` (canal, documento, estado, descuento, vendedor) · `venta_lineas` · `pagos` (método, moneda, monto, referencia, tasa, IGTF) · `abonos` · `presupuestos` + `presupuesto_lineas` + `presupuesto_eventos` · `cajas_turno` (apertura por método, cierre, contado $, contado Bs, diferencia) · `caja_movimientos` · `gastos` + `gastos_recurrentes` · `proveedores` + `proveedor_calificaciones` · `compras` + `compra_lineas` + `compra_pagos` · `ordenes_pago` · `consumo_interno` · `asientos` (movimientos contables) · `empleados` + `nomina_pagos` + `adelantos` · `documentos_fiscales` (factura, NC, ND) · `promociones` + `canjes` · `traspasos` · `ia_creditos` (movimientos) + `ia_acciones` (propuesta, estado, datos para deshacer) · `learning_videos` + `learning_progreso` · `auditoria`.

Seguridad obligatoria:
- PIN, claves de sede y contraseñas: **solo con hash**, nunca en texto.
- Límite de intentos de PIN y de clave de sede en el servidor.
- Aislamiento por empresa en cada consulta.
- Registro de auditoría para: anular venta, notas de crédito, ajustes de inventario, cambios de precio, cambios de permisos, acciones del Asistente IA.

---

## 7. Funciones que la preview simula y que deben quedar reales

Decisión del dueño: **todas se implementan de verdad, excepto la factura fiscal, que queda bloqueada.** Ninguna puede quedar como toast o como botón sin efecto.

| Función | En la preview | Implementación real requerida |
|---|---|---|
| Tasa BCV automática | Valor fijo | Tarea programada en el servidor: 7:00 p. m. obtiene la tasa publicada por el BCV con su fecha valor, la guarda en `tasas` y la activa a las 12:00 a. m. de esa fecha; verificación nocturna; botones "Actualizar tasa ahora" y "Adelantar la próxima tasa"; tasa manual que suspende la automática |
| Enviar por WhatsApp | Toast | Cada empresa vincula su número por código QR desde Marketing, como un dispositivo de WhatsApp Web, y el sistema envía mensajes y PDF desde ese número. Sin vínculo, se abre `wa.me` |
| PDF e impresión | Vista previa HTML | PDF real en 58 mm, 80 mm y carta; impresión con CSS `@page` por formato; "Imprimir prueba" funcional |
| Continuar con Google | Entra directo | OAuth de Google sobre el sistema de autenticación existente |
| Asistente IA | Respuestas programadas | Modelo de lenguaje de un proveedor gratuito, configurable por variables de entorno, con herramientas reales sobre los datos del negocio; propuesta → confirmación → aplicar → deshacer 24 h; descuento de créditos en el servidor |
| Dictado por voz | API del navegador | Igual, con los mensajes de error de la referencia |
| Pago de suscripción | "Simular aprobación" | Subida real del comprobante, aviso al administrador de KR System por WhatsApp y correo, y **panel de administrador** para aprobar o rechazar; al aprobar se activa el plan y se registra en el historial |
| Recarga de créditos | Toast | Mismo flujo de pago con comprobante; al aprobar se acreditan |
| Modo sin internet | Interruptor | Se conserva el modo sin conexión que ya tiene el sistema |
| Reporte diario por correo | Toast | Tarea programada a la hora elegida, hasta 5 destinatarios; "Enviar prueba" funcional |
| Reporte semanal | Datos fijos | Se genera cada lunes 6:00 a. m. con datos reales y se descarga en Excel |
| Importar / exportar Excel | Toast | Lectura y generación real de .xlsx (inventario, clientes, cobros, ventas, movimientos) con plantilla descargable |
| Videos de Learning | Reproductor simulado | Subida y reproducción real de video, progreso por usuario |
| Recordatorios y promociones | Toast | Envío real por WhatsApp o correo a la lista elegida |
| **Factura fiscal** | "Próximamente" | **Bloqueada.** En el POS se muestra sombreada, con candado y "Próximamente"; no se puede elegir. No implementar emisión fiscal |

Cada integración externa necesita credenciales que solo el dueño puede dar (API de WhatsApp, servicio de correo, clave del modelo de IA, OAuth de Google, almacenamiento de archivos). Van en variables de entorno, nunca en el código. Si falta una credencial, la fase se detiene y se pide; no se sustituye por una simulación.

---

## 8. Criterios de aceptación (aplican a cada pantalla)

1. Al lado de la referencia, a 390px y a 1440px de ancho, coinciden: estructura, orden de bloques, textos, colores, radios, tamaños y espaciado.
2. Funciona en modo claro y oscuro sin colores fijos.
3. Barra inferior bajo 960px, riel lateral desde 960px.
4. Todo formulario y detalle abre en hoja inferior; cierra con Escape y clic en el fondo.
5. Navegable por teclado, con foco visible; botones de icono con `aria-label`.
6. Los textos visibles son los de la referencia (español, mismo tono y mismas palabras).
7. Datos reales desde el backend; estados vacío, cargando y error presentes.
8. Permisos y límites del plan aplicados en interfaz **y** servidor.
9. Las cifras cuadran entre módulos (la ganancia de Inicio = la de Administración → Resumen para el mismo periodo).
10. No se rompió ninguna función que ya existía: pruebas y compilación en verde.
