# KR POS · Paridad visual con la preview

Regla: **la app real debe verse igual que la preview. No se aceptan diferencias de estructura, orden, tamaños, colores, radios, sombras, espaciado ni textos.** Solo cambian los datos (reales en vez de los de ejemplo).

Los valores de este documento se midieron en la preview renderizada en un navegador a 1440×900 y 390×844.

## 1. Diferencias visuales verificadas (11 nov 2026)

Comparación hecha con la app real corriendo con la empresa de pruebas, a 1440×900 (los 12 módulos) y 390×844 (Inicio y POS), contra la preview renderizada. Las capturas de ambos lados están en `visual/capturas-2026-11-11/` (`<modulo>-APP.jpg` y `<modulo>-PREVIEW.jpg`): **ábrelas antes de tocar cada pantalla.**

No se compararon en vivo: acceso y bloqueo (la sesión ya estaba abierta), hojas y formularios (no se abrió ninguno), tema oscuro, ni Learning con videos (la base de pruebas no tiene videos). Esas partes se rigen por el contrato de §2.

La moneda de la empresa de pruebas es el euro; eso es dato, no diferencia. Sí es diferencia el orden: ver P4 e I6.

### Globales (afectan a todas las pantallas)
| # | Dónde | Preview | App hoy |
|---|---|---|---|
| G1 | Cabecera del menú | Cuadro de 44px, radio 14, color marca, con "KR" (o el logo del negocio) + "KR POS" en 17px negrita + nombre del negocio debajo. Sin línea divisoria | Logotipo "krpos" en imagen, nombre debajo, con línea divisoria |
| G2 | Chip "Sede activa" | Radio 14px, padding 10px 12px, etiqueta 11px/700, nombre 15px negrita, sin flecha | Píldora grande muy redondeada, con flecha de desplegable. Conservar que abra el cambio de sede, pero con la forma de la preview |
| G3 | Ítem del menú | Radio 12px; alto 44px; **los 12 módulos caben sin scroll a 900px de alto** | Radio 19,6px; el menú hace scroll y corta "Asistente IA" |
| G4 | Iconos del menú | casa · caja registradora · caja/paquete · documento · caja con monedas · barras · megáfono · maletín · tienda · destello · birrete · engranaje (objeto `IC` de la referencia 00, última definición) | tablero · carrito · paquete · portapapeles · billetera · barras · personas · calculadora · documento · tienda |
| G5 | Módulos del menú | 12 | 13: sobra "Documentos" |
| G6 | Pie del menú | Pill "Plan … · N usuarios" a todo el ancho, pill "Tasa Bs …" a todo el ancho, botón "Bloquear pantalla" a todo el ancho, y fila de usuario (avatar 38px + nombre + rol) | Caja gris con plan y tasa, fila de usuario, y fila de 4 iconos (tema, candado, salir, colapsar) |
| G7 | Menú colapsable | No existe | Existe (icono abajo a la derecha) |
| G8 | Teléfono, arriba | Sin barra superior; el contenido empieza con el eyebrow | Barra superior con menú, logotipo, nombre y lupa |
| G9 | Título de tarjeta | 16px, peso **700** | 16px, peso 500 |
| G10 | Etiqueta del periodo | Chip blanco con borde, **icono de calendario** y texto en negrita | Chip sin icono, peso normal |
| G11 | Posición del selector de periodo | Debajo del título, alineado a la izquierda, seguido de la etiqueta | En Presupuestos y Estadísticas está arriba a la derecha y sin etiqueta |
| G12 | Contenedor de icono en mosaicos, listas y avatares de producto | **Cuadro redondeado** (radio 12–14px, 44px) con fondo suave | Círculo |
| G13 | Chips de filtro | Rectángulo de radio 12px, alto 38px | Píldora totalmente redonda |
| G14 | Separación entre bloques | 18px | 20px |
| G15 | Cabecera de tabla | 12px, peso 700 | Peso normal |
| G16 | Viñeta de avisos ("Lo que no puede esperar") | Pequeña pill con punto, fondo suave del estado | Punto suelto |
| G17 | Punto de corte | 960px | 768px |
| G18 | Formularios y detalles | Hoja inferior (ver §2 `sheet`) | Diálogo centrado (visto en el código, no en vivo) |

### Inicio
| # | Preview | App hoy |
|---|---|---|
| I1 | Título 38,4px | 36px |
| I2 | Tarjeta de ganancia: radio 19px, padding 16px | Radio 22px, padding 24px |
| I3 | El último chip del desglose (Comisiones) va con fondo verde suave | Todos blancos |
| I4 | Mosaicos de acceso rápido con icono en cuadro redondeado; iconos: caja registradora, documento, billete, caja, caja | Icono en círculo; iconos distintos (carrito, portapapeles, mano con moneda, billetera, caja) |
| I5 | "Meta de [mes]" | "Meta de ganancia" |
| I6 | Montos: divisa de referencia grande y bolívares pequeño debajo | Igual aquí; revisar que el formato de la divisa vaya con el símbolo delante cuando sea dólar |
La línea "Calculada con los días que ya tienen cierre de caja" se conserva (decisión D7).

### POS
| # | Preview | App hoy |
|---|---|---|
| P1 | "Ventas del día" es un botón de 40px con icono de barras | Pill pequeña |
| P2 | Buscador blanco de 50px, sin foco al entrar, texto "Buscar producto, SKU o escanear (/)"; sin botón aparte | Buscador con anillo de foco grueso al cargar, texto "Buscar producto por nombre o SKU…" y botón "Escanear" al lado |
| P3 | Chip "Todos 14": número en línea, pequeño | Número como superíndice |
| P4 | Tarjeta de producto: avatar en cuadro redondeado; nombre 15px **negrita**; **precio en divisa grande (18px negrita) y bolívares pequeño debajo** | Avatar en círculo; nombre peso normal; bolívares grande y divisa pequeña |
| P5 | Panel "Venta actual" con alto según contenido | Panel estirado a toda la altura |
| P6 | "Registrar cliente" con icono +, "Directorio" con icono de personas, ambos de 46px | Sin icono en Directorio; más bajos |
| P7 | Vacío: icono de carrito + "Aún no hay productos" + "Toca un producto para agregarlo" | Solo "Agrega productos para empezar una venta." |
| P8 | Totales: fila "Subtotal"; luego "Total estimado" a la izquierda en 34px y "Equivalente · Bs" a la derecha | Una fila "Total" con bolívares a la derecha |
| P9 | Botones "En espera" (icono de pausa, atajo E) y "Cobrar $0,00" (con el monto, atajo C) | "En espera" y "Cobrar" sin monto ni atajos |
| P10 | Teléfono: barra flotante oscura abajo "Ver venta actual · $0,00 ›" con contador | Verificar que exista con esa forma |

### Inventario
| # | Preview | App hoy |
|---|---|---|
| N1 | Primera fila: pill blanca "12 de 200 productos" con barra de avance y nombre del plan. Segunda fila: pills de valor y tasa | Todo en una fila, sin barra de avance |
| N2 | Acciones, en este orden: Nuevo producto · Actualizar inventario · Importar · Lista de reposición · Lista de precios · Exportar Excel | Nuevo producto · Actualizar inventario · Importar · Traspasos · Consumo interno · Descargar lista de precios. "Lista de reposición" y "Exportar Excel" están dentro de la tarjeta de filtros |
| N3 | Aviso flotante arriba a la derecha: "N productos necesitan reposición · Reponer · ✕" | No existe |
| N4 | Filtros en **una** fila: estados + buscador gris en píldora + selector de categoría gris | Dos filas, con contador "13 productos" y estado "Inactivo" |
| N5 | Tabla: Costo y Precio en divisa en una línea; "Valor en stock" en divisa con bolívares debajo; nombre en negrita | Precio en bolívares con divisa debajo; nombre peso normal |
Traspasos y Consumo interno no se borran: Traspasos pasa a Sucursales y Consumo interno a Administración.

### Presupuestos
| # | Preview | App hoy |
|---|---|---|
| R1 | Barras del embudo con color por paso (marca, turquesa, naranja, verde); barras de "Por qué se pierden" en rojo | Barras grises |
| R2 | Lista en **cuadrícula de 3 tarjetas**, una por presupuesto: cliente, N.º y fecha, monto 26px, pills (vigencia, % de cierre, Visto), sugerencia en caja lila y botones Facturar · Enviar · Ver, con menú ⋯ | Tarjeta "Seguimiento" con texto de ayuda y lista dentro |
| R3 | Filtros: Todos · Pendiente · Convertido · Perdido | Todos · Pendiente · Aprobado · Perdido |
| R4 | Botón "+ Nuevo presupuesto" alineado con el selector de periodo, a la derecha | Junto al título |

### Caja Chica
| # | Preview | App hoy |
|---|---|---|
| C1 | En la cabecera de "Estado de la caja", a la derecha: pill Abierta/Cerrada · "Abrir caja" (primario) · "Generar Corte Z" · "Cerrar caja" (rojo suave) | No están ahí. Más abajo hay un campo de fecha, "Sin abrir", "Generar Corte Z" e "Imprimir Corte Z" |
| C2 | Después de los tres KPI: fila plegada "Días pendientes por cerrar" con contador y flecha | Bloques "Total vendido / Ventas", "Estado de cobro" y "Caja Chica · Efectivo del día" |
| C3 | Tarjeta "Ventas del día": chips de canal a la derecha, chips de estado, selector de periodo y tabla N.º · Hora · Cliente · Canal (pill de color) · Método · Estado · Total · ⋯ | Verificar más abajo; no aparece en la primera pantalla |
| C4 | KPI "Efectivo esperado" con bolívares debajo | Texto "Apertura + efectivo − salidas" |
Los bloques de C2 que la preview no muestra pasan al detalle del Corte Z.

### Estadísticas
| # | Preview | App hoy |
|---|---|---|
| E1 | Fila de 3 franjas verdes: "Ventas +12,4 % vs. periodo anterior", "Venta promedio …", "Gastos …" | No existe |
| E2 | KPI: fila de 3 (Ventas · Venta promedio · Gastos) y fila de 2 (Pedidos · Clientes nuevos), cada uno con línea de pista | Fila de 5 (Ingresos totales · Por cobrar · Costo · Gastos · Comisiones) y fila de 4 (Pedidos · Venta promedio · Clientes nuevos · Margen bruto), sin pista |
| E3 | Icono del KPI dentro de la tarjeta, a 14px del borde | El icono sobresale por la esquina superior derecha |
| E4 | Tras los KPI va el mapa de calor | Antes van "Ganancia neta estimada" y "Cascada de utilidad", que en la preview viven en Administración → Balance → Resumen |
| E5 | Etiquetas de día del mapa en negrita; leyenda "Menos ▭ Más ventas" y frase de picos | Etiquetas en peso normal |

### Marketing
Hoy la pantalla tiene otra estructura. La preview, en orden:
1. Pill "CRM" bajo el título.
2. 4 KPI: Clientes · Frecuentes · Cumpleañeros · Inactivos.
3. Tarjeta con interruptor "Exigir nombre y teléfono en cada venta" y, a la derecha, "Importar Excel" · "Plantilla" · "+ Añadir cliente".
4. Dos columnas: "Mapa de clientes" (4 cuadrantes de color) y "Agenda de contactos" (filas con fecha en pill y "WhatsApp").
5. Tarjeta "Clientes" con buscador y tabla.
Hoy: botón "Nuevo cliente" arriba a la derecha, lista "Clientes a contactar", buscador y lista con panel de detalle.

### Administración
Hoy es un buscador y 7 tarjetas de enlace. La preview, en orden:
1. Pills de tasa y periodo bajo el título.
2. Fila de 5 tarjetas de grupo (Balance · Cuentas Bancarias · Compras · Consumo Interno · Contabilidad); la activa en color marca con texto blanco.
3. Chips de sub-pestaña.
4. Selector de periodo con etiqueta.
5. Contenido del sub-apartado (en Resumen: tarjeta verde de ganancia con "= Ganancia", 4 KPI, Cascada y Punto de equilibrio).

### Sucursales
| # | Preview | App hoy |
|---|---|---|
| S1 | Bajo el título: selector de periodo con etiqueta y, a la derecha, "+ Nueva sucursal" | Párrafo explicativo; sin selector ni botón |
| S2 | Aviso con candado: título "Has entrado a N de M sedes" y texto debajo | Una sola línea "Resumen de toda la red. …" |
| S3 | KPI "Mejor sede" con el nombre completo | Nombre cortado ("Sucursal Prin…") |
| S4 | Avisos con botón "Ver sede" a la derecha | Sin botón |
| S5 | Tarjeta de sede: icono en cuadro redondeado, nombre 18px negrita, dirección con icono de ubicación, menú ⋯, pills de estado ("Abierta desde 8:02 a. m."), ventas en 26px con bolívares debajo y mini gráfico de línea, columnas "Ganancia neta est." y "Pedidos" | Nombre en peso normal con "Estás aquí / Activa" debajo, caja gris "Ganancia est. del mes", barra de meta, y tres mosaicos Hoy · Productos · Personal |

### Asistente IA
Hoy muestra un párrafo, la fila "¿Se te acabaron los créditos?" y el aviso de que no está activado. La preview:
1. Pills "N créditos" y "+ Recargar créditos".
2. Segmentado Asistente · Créditos · Historial.
3. Tarjeta grande: orbe con degradado, título centrado "¿Qué hacemos hoy por tu negocio?", subtítulo, 6 mosaicos grises en 4 columnas, y al pie la línea de costo, el campo de texto en píldora, botón de micrófono y botón de enviar circular.
El conmutador "Gerente / Vendedor" de la preview es de demostración: no va.

### Learning
Sin videos en la base de pruebas no hay comparación. La preview: reproductor oscuro a la izquierda (radio 19px, "MÓDULO 1 DE 10"), tarjeta de detalle con "Hacer el quiz" · "Practicar en mi sistema" · "Preguntar al Asistente IA" y "Lo que aprendes"; a la derecha, anillo de avance, chips "Tu ruta" y lista numerada de módulos.

### Ajustes
| # | Preview | App hoy |
|---|---|---|
| A1 | Bajo el título: pills "Tasa Bs …" y "N % listo" | Dos cajas: "Código de empresa y empleados · Administrar" y "Suscripción mensual vence el … · Ver detalles" |
| A2 | Guía de 6 pasos | 5 pasos |
| A3 | Tarjetas inferiores en orden: Marca · Negocio · Pagos y Moneda · Equipo y Seguridad · Impresión y Datos · Mi Plan, con icono en cuadro redondeado | Mi Plan primero; icono en círculo |
| A4 | Icono de la pestaña Negocio: tienda | Documento |
Las dos cajas de A1 pasan dentro de "Equipo y Seguridad" y "Mi Plan".

## 2. Contrato de medidas

Archivo `visual/contrato.json`. Cada componente compartido lleva un atributo `data-kr` y debe dar exactamente estos valores calculados:

| `data-kr` | Valores obligatorios |
|---|---|
| `h1` | 38,4px en computadora y 28,8px en teléfono · peso 800 · espaciado −0,035em · interlineado 1,05 |
| `eyebrow` | 12px · peso 600 · espaciado 0,12em · mayúsculas · color `#6e6e73` |
| `card` | radio 19px · padding 16px · fondo `#ffffff` · sombra `0 1px 2px rgba(0,0,0,.04), 0 6px 24px rgba(0,0,0,.05)` |
| `kpi` | radio 19px · padding 17px · alto mínimo 128px |
| `kpi-num` | 30px · peso 700 · espaciado −0,03em · cifras tabulares |
| `kpi-lbl` | 12px · peso 600 · mayúsculas |
| `btn` | alto mínimo 40px · padding 0 14px · 13px · peso 600 · radio 999px |
| `btn-primary` | fondo `#433ddd` · texto blanco |
| `pill` | 12px · peso 600 · padding 3px 10px · radio 999px |
| `chip` | alto mínimo 38px · radio 12px · 13px · peso 700 · padding 0 14px · borde 2px marca cuando está activo |
| `seg-btn` | alto mínimo 34px · 13px · peso 700 · padding 0 14px · el activo con fondo tarjeta y sombra `0 1px 3px rgba(0,0,0,.15)` |
| `input` | alto mínimo 50px · radio 14px · 16px · borde 1,5px |
| `th` | 12px · peso 700 · padding 11px 14px · color `#6e6e73` |
| `td` | padding 11px 14px · borde inferior 1px `#e6e9f1` |
| `sheet` | ancho máx. 560px · radio 24px 24px 0 0 · padding 18px 18px 22px · pegada abajo · alto máx. 88vh |
| `sheet-title` | 20px · espaciado −0,02em |
| `toast` | fondo `#1d1d1f` · texto blanco · radio 999px · peso 600 · abajo al centro (92px del borde en teléfono) |
| `side` | 260px de ancho · fondo tarjeta · borde derecho 1px |
| `nav-item` | alto mínimo 44px · radio 12px · 14px · peso 700 · padding lateral 12px · separación icono-texto 12px · **activo: fondo del color del módulo al 15 % y texto e icono del color del módulo** (no el lila de marca) |
| `nav-icon` | 24×24px · sin fondo · color del módulo |
| `nav-group` | 11px · peso 800 · espaciado 0,1em · mayúsculas |
| `side-logo` | cuadro 44×44px · radio 14px · fondo marca · letras "KR" blancas peso 800 |
| `side-sede` | bloque radio 14px · padding 10px 12px · fondo `rgba(120,120,128,.12)` |
| `tab-center` | 54×54px · círculo marca · borde 4px del color tarjeta · sube 22px sobre la barra |
| `wrap` | ancho máx. 1120px · padding 20px 16px · separación vertical 18px entre bloques |

Otras medidas fijas:
- Cuadrículas: KPI `repeat(auto-fit, minmax(min(100%,180px),1fr))` con 12px; dos columnas `minmax(min(100%,330px),1fr)` con 14px.
- Botón de menú ⋯: 36×36px, circular, fondo transparente.
- Movimiento: 150 ms en hover y presión, 250 ms en hojas, curva `cubic-bezier(.4,0,.2,1)`; los botones bajan a `scale(.97)` al presionar.
- Foco: anillo de 3px color marca con 2px de separación.
- Tema oscuro: los valores de `tokens.css` bajo `data-theme="dark"`; ningún color fijo en componentes.

## 3. Reglas para escribir interfaz

1. Antes de tocar una pantalla, abrir su preview y copiar del bloque `<style>` de `referencia-lectura/` las reglas de las clases que usa. Traducirlas a Tailwind con valores exactos entre corchetes cuando no exista la clase (`rounded-[19px]`, `min-h-[128px]`, `text-[13px]`).
2. Mismo orden de bloques, misma cantidad de columnas y mismos textos que la preview. No agregar bloques, botones ni textos que la preview no tenga.
3. Lo que hoy existe y la preview no muestra **no se borra del sistema**: se reubica dentro del módulo que le corresponde o queda accesible desde un menú ⋯, sin alterar la pantalla principal. Si no hay sitio claro, detenerse y preguntar.
4. Prohibido: colores hex sueltos en componentes, sombras o radios inventados, degradados en controles, tamaños de letra fuera de la escala 10/11/12/13/14/15/16/20/26/30/34.
5. Iconos: los mismos de la preview (Lucide, trazo 2). El nombre exacto se saca del objeto `IC` de la referencia.
6. Cada componente compartido lleva su `data-kr`.

## 4. Cómo verificar (obligatorio al cerrar cada fase)

Con la app corriendo contra la **base de pruebas** (nunca producción):

```
E2E_BASE_URL=http://localhost:3000 KR_STORAGE=<sesión guardada> node rediseno/visual/comparar.mjs <modulo>
```

El script hace tres cosas por módulo, a 1440px y 390px, en claro y oscuro:
1. Captura la preview y la app y las guarda en `rediseno/visual/salida/` con el mismo nombre (`-preview.png` y `-app.png`).
2. Mide los componentes `data-kr` de la app contra `contrato.json` y escribe los que no coinciden en `informe.json`.
3. Falla si hay desborde horizontal.

Una fase está terminada solo si:
- `informe.json` queda vacío para ese módulo, **y**
- se abrieron las dos capturas de cada combinación y se comprobó, bloque por bloque, que coinciden en estructura, orden, alineación, tamaños y textos. Las diferencias se listan en el resumen de la fase y se corrigen antes de cerrar.

El script necesita una sesión guardada de un usuario de pruebas (`KR_STORAGE`). Se genera una vez con Playwright entrando con ese usuario.

Nota: el script mide estilos y produce las capturas; la comparación bloque por bloque de las dos imágenes la hace quien ejecuta la fase.

Las diferencias ya vistas pantalla por pantalla, con la app real abierta, están en `DIFERENCIAS-OBSERVADAS.md`. En `visual/preview-capturas/` hay una captura de cada pantalla de la preview para tenerla a la vista.
