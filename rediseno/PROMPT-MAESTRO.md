# KR POS · Prompt maestro para Claude Code

**Este es el archivo de entrada.** La carpeta completa se copia al repositorio como `rediseno/`.

| Archivo | Contenido |
|---|---|
| `PROMPT-MAESTRO.md` | Este archivo: lo que se pega en Claude Code |
| `DIFERENCIAS-OBSERVADAS.md` | 55 diferencias visuales vistas con la app real abierta |
| `PARIDAD-VISUAL.md` | Medidas exactas y método de verificación |
| `BRECHAS-Y-PLAN.md` | Funciones que faltan por módulo y las 24 fases |
| `ESPECIFICACION.md` | Qué debe tener cada pantalla |
| `CLAUDE-reglas.md` | Reglas para añadir al `CLAUDE.md` del repositorio |
| `visual/` | `comparar.mjs`, `sesion.mjs`, `contrato.json` y capturas de la preview |
| `referencia/`, `referencia-lectura/` | Los HTML de la preview |

Cómo usarlo: copia la carpeta `rediseno/` al repositorio. En cada sesión nueva de Claude Code pega el **Bloque A** completo y, debajo, **una** fase del Bloque B. Una fase por sesión.

---

## BLOQUE A · Directrices fijas (pegar siempre)

```
Vas a trabajar en KR POS (Next.js 16, React 19, Tailwind 4, Prisma 7, Postgres con aislamiento por empresa).
Objetivo: que la app real quede IDÉNTICA a la preview guardada en rediseno/, en lo visual y en lo funcional.

ANTES DE ESCRIBIR CÓDIGO, LEE EN ESTE ORDEN:
1. AGENTS.md (manda sobre todo lo demás).
2. rediseno/CLAUDE-reglas.md
3. rediseno/PARIDAD-VISUAL.md: §2, §3, §4 completos y, de §1, "Globales" más la tabla del módulo de esta fase
   3b. Las dos capturas del módulo en rediseno/visual/capturas-2026-11-11/ (<modulo>-APP.jpg y <modulo>-PREVIEW.jpg)
3b. En rediseno/DIFERENCIAS-OBSERVADAS.md: "Medidas reales" y la sección de la pantalla de esta fase. Cada punto numerado de esa sección es obligatorio.
4. En rediseno/BRECHAS-Y-PLAN.md: la sección del módulo de esta fase.
5. En rediseno/ESPECIFICACION.md: la sección del módulo de esta fase.
6. La guía de Next en node_modules/next/dist/docs/ para lo que vayas a usar.

REFERENCIA VISUAL:
- rediseno/visual/preview-capturas/*.jpg: una captura de cada pantalla de la preview. Ábrela antes de empezar.
- rediseno/referencia/*.html se abre en el navegador. NO la leas con la herramienta de lectura (pesa hasta 850 KB).
- rediseno/referencia-lectura/*.html sí se lee, pero por tramos: busca con grep un texto visible de la pantalla y lee solo ese tramo y las clases CSS que usa.
- Si dos partes del código de la preview se contradicen, vale la última del archivo.
- Si la preview y este prompt se contradicen, vale este prompt (decisiones del dueño, abajo).

REGLA VISUAL (la más importante):
- La pantalla real debe verse igual que la preview: misma estructura, mismo orden de bloques, mismas columnas, mismos tamaños, colores, radios, sombras, espaciado, iconos y textos. Solo cambian los datos.
- Usa las medidas exactas de rediseno/PARIDAD-VISUAL.md. Cuando Tailwind no tenga la clase, usa valores entre corchetes.
- Cada componente compartido lleva su atributo data-kr según rediseno/visual/contrato.json.
- No agregues bloques, botones ni textos que la preview no tenga. No inventes colores, radios ni sombras.
- Lo que hoy existe y la preview no muestra NO se borra: se reubica en su módulo o en un menú ⋯. Si no hay sitio claro, detente y pregunta.
- Copia los textos de la interfaz tal cual de la preview.

DECISIONES DEL DUEÑO (no se discuten):
D1. Marketing: todo lo de clientes vive en el módulo Marketing y solo ahí (Clientes, Promociones, Cuentas por cobrar, cumpleaños, conexión de WhatsApp).
D2. Descuentos de suscripción: el ÚNICO es plan Emprende, primer mes a $10; después $12,99. No existen cupones, ni "50 %", ni tarjeta de bienvenida, ni campo de código de descuento. No los copies de la preview.
D3. Recargas de créditos IA: sí llevan etiqueta de ahorro. 50 créditos $5 (sin etiqueta) · 100 por $9 "Ahorra 10 %" · 250 por $20 "Ahorra 20 %" y "Más popular" · 500 por $35 "Ahorra 30 %" · 1.000 por $60 "Mejor valor · −40 %".
D4. Factura fiscal: en el POS aparece como opción de documento, sombreada y con candado, y no se puede elegir. No implementes emisión fiscal nueva. No borres facturas ni libros que ya existen.
D5. Ajustes NO tiene horario de atención. No lo implementes aunque la preview lo muestre.
D6. Modo sin internet: se usa el que ya existe (app/pos/offline, lib/offline). No construyas otro. En Ajustes solo se muestra su estado.
D7. Ganancia de Inicio: se mantiene la fórmula actual, calculada con las ventas de los días que ya tienen cierre de caja. No la cambies.
D8. WhatsApp: se conecta por código QR como dispositivo vinculado, desde Marketing (detalle en la fase 22).
D9. Asistente IA: usa un proveedor gratuito, sin costo por uso (detalle en la fase 19).
D10. Todo lo que la preview simula se implementa de verdad, excepto la factura fiscal.

REGLAS DE CÓDIGO:
- Rama propia: claude/<tema de la fase>. Nunca a main.
- Toda consulta Prisma con datos de empresa va dentro de withTenant(companyId, ...).
- Migraciones solo aditivas. Nunca contra producción. Pruebas solo con la base de pruebas.
- Permisos y límites del plan se validan en el servidor, no solo ocultando botones.
- PIN, claves de sede y sesiones de WhatsApp nunca en texto plano.
- No commitees .env*, llaves ni .claude/.
- No instales dependencias que la fase no pida. Si necesitas una, dilo antes.
- No toques archivos fuera del alcance de la fase.

CÓMO CERRAR LA FASE (obligatorio, en este orden):
1. npx tsc --noEmit
2. npx eslint .
3. npx next build
4. Con la app en la base de pruebas (E2E_BASE_URL con el puerto real; sesión creada una vez con rediseno/visual/sesion.mjs): node rediseno/visual/comparar.mjs <modulo>
   - rediseno/visual/salida/informe.json debe quedar vacío para el módulo.
   - Abre cada par de capturas (-preview.png y -app.png) a 1440 y 390, en claro y oscuro, y compara bloque por bloque.
5. Resumen de máximo 20 líneas: archivos tocados, diferencias visuales que quedaron y por qué, pendientes, y cómo probarlo.
Si algo de 1 a 4 falla, corrígelo antes del resumen. No empieces otra fase.

SI TE FALTA ALGO:
- Una credencial o dato externo: detente y pídelo. No lo sustituyas por una simulación.
- Una regla de negocio dudosa o un choque entre la preview y el sistema actual: detente y pregunta.
```

---

## BLOQUE B · Fases (pegar una)

### Fase 0 · Base visual (primero que todo)
```
FASE 0 · Base visual. Rama claude/base-visual. Módulos para comparar: inicio y pos.
Abre primero las capturas de rediseno/visual/capturas-2026-11-11/ (inicio-APP.jpg frente a inicio-PREVIEW.jpg, y las de teléfono).
Corrige TODAS las diferencias "Globales" G1 a G18 de rediseno/PARIDAD-VISUAL.md §1:
- Punto de corte teléfono/computadora a 960px (define un breakpoint propio en Tailwind y úsalo en vez de md: donde dependa del menú).
- Menú lateral: cabecera, chip de sede, radio de ítems, iconos, pie y altura según G1 a G7; los 12 módulos deben caber sin scroll a 900px de alto; sin colapsar.
- Teléfono: sin barra superior (G8). El cambio de sede, la búsqueda y el resto de lo que hoy vive en esa barra pasa a la hoja "Más".
- Hoja "Más": cuadrícula de 3 columnas con los módulos + "Modo claro / oscuro" + "Bloquear pantalla".
- Documentos, Perfiles y PIN, Suscripción mensual, Nómina y Plataforma siguen existiendo, enlazados desde Administración o Ajustes, no desde el menú.
- Crea components/ui/sheet.tsx: hoja inferior con las medidas del contrato (data-kr="sheet"), con vaul, que ya está instalado. Migra a hoja inferior los usos de components/ui/dialog.tsx que sean formulario, detalle o confirmación.
- Ajusta button, input, card (título en peso 700), badge, table (cabecera en peso 700) y StatCard a las medidas exactas del contrato y ponles data-kr.
- Crea los compartidos que falten: PageHeader, Chip (radio 12px), Segmented, PeriodBar (selector + etiqueta con icono de calendario), GroupTabs, IconTile (cuadro redondeado).
- Sustituye en toda la app los círculos de icono de mosaicos, listas y avatares de producto por IconTile (G12), y los chips de filtro redondos por Chip (G13).
No cambies lógica de negocio.
```

### Fases 1 a 23
Usa las filas de la tabla de `BRECHAS-Y-PLAN.md` §6 con este formato:
```
FASE [n] · [nombre]. Rama [rama]. Módulo para comparar: [modulo de contrato.json].
Cierra todas las brechas de la sección "[módulo]" de rediseno/BRECHAS-Y-PLAN.md §4 y todos los puntos de esa pantalla en rediseno/DIFERENCIAS-OBSERVADAS.md, respetando las decisiones D1 a D10.
```

### Fase 6 · POS cobro (texto adicional)
```
En el selector "Documento" muestra tres opciones como en la preview: Nota de entrega (por defecto) · Ticket rápido de caja · Factura fiscal.
Factura fiscal va sombreada (opacidad reducida), con icono de candado y la etiqueta "Próximamente"; no responde al toque y lleva aria-disabled.
Quita el texto "Podrás emitir la factura al terminar la venta" y la acción "Generar factura" de la pantalla de venta completada del POS.
No toques el Libro de ventas, las notas de crédito y débito ni las facturas ya emitidas.
```

### Fase 16 · Mi Plan (texto adicional)
```
Sin cupón ni descuentos (D2). En el resumen de pago, solo si el plan es Emprende y la empresa no tiene pagos aprobados, muestra "Primer mes · $10" y debajo "Desde el 2.º mes · $12,99". Usa amountDueUsdCents de lib/plans.ts; no dupliques la regla.
Recargas de créditos con las etiquetas de D3: agrega el campo de etiqueta a AI_PACKS en lib/assistant.ts y muéstralo en Mi Plan y en el Asistente.
```

### Fase 19 · Asistente IA con proveedor gratuito
```
FASE 19 · Asistente IA. Rama claude/asistente-gratis. Módulo para comparar: asistente.
1. Proveedor sin costo. Hoy lib/actions/assistant.ts llama a un servicio de pago. Sustitúyelo por una capa de proveedor con formato compatible con OpenAI (chat/completions con herramientas), configurada solo por variables de entorno:
   AI_BASE_URL, AI_API_KEY, AI_MODEL  y, opcionales para respaldo, AI_FALLBACK_BASE_URL, AI_FALLBACK_API_KEY, AI_FALLBACK_MODEL.
   No dejes ningún nombre de modelo ni dirección fija en el código. Agrega las variables a .env.example sin valores.
2. Protección de la cuota gratuita (la clave es una sola para todas las empresas):
   - Contador diario global y por empresa en Redis (ya existe @upstash/redis) o en base de datos.
   - Si el proveedor responde 429 o se agota la cuota: prueba el proveedor de respaldo; si también falla, muestra "El asistente está ocupado. Intenta de nuevo en unos minutos." y NO descuentes créditos.
   - Límite por usuario: las 10 consultas gratis al día de la preview.
   - Nunca llames a un modelo de pago como respaldo.
3. Privacidad: envía al modelo solo los datos necesarios para la consulta, sin teléfonos, cédulas ni RIF de clientes.
4. Interfaz igual a la preview: tres pestañas (Asistente · Créditos · Historial), controles (tope mensual, solo el gerente aplica, deshacer 24 h), tabla "Cómo se cobra".
5. Acciones con propuesta → confirmar → aplicar → deshacer: las dos que existen (registrar gasto, ajustar precios) más inventario desde Excel, recordatorios de cobro, promoción para clientes dormidos, armar presupuesto y explicar la ganancia.
Los créditos se siguen descontando a la empresa al aplicar (5 por uso), aunque el proveedor sea gratuito.
Si AI_API_KEY no está definida, detente y pídela.
```

### Fase 22 · WhatsApp por código QR
```
FASE 22 · WhatsApp vinculado por QR. Rama claude/whatsapp-qr. Módulo para comparar: marketing.
Objetivo: cada empresa vincula su propio número escaneando un QR desde Marketing, como en WhatsApp Web, y KR POS envía mensajes desde ese número.
1. Servicio aparte: crea services/whatsapp/ (Node, proceso permanente) y agrégalo a infra/app/docker-compose.yml. No puede vivir en funciones sin servidor: necesita una conexión abierta.
   - Biblioteca: baileys (paquete oficial del proyecto WhiskeySockets). Versión fija exacta en package.json. Prohibido usar bifurcaciones o paquetes "anti-ban" de terceros.
   - Una sesión por empresa. Credenciales de sesión cifradas en reposo (clave en variable de entorno), nunca en el repositorio ni en registros.
   - API interna protegida con un secreto compartido: iniciar vínculo (devuelve el QR), estado, enviar mensaje, enviar documento PDF, desvincular.
   - Reconexión automática; si WhatsApp cierra la sesión, el estado pasa a "Desvinculado".
2. En Marketing (y solo ahí), tarjeta "WhatsApp": estado Conectado / Desconectado, número vinculado, botón "Conectar WhatsApp" que abre una hoja con el QR que se renueva solo, y "Desvincular" con confirmación. Estilo de la preview (tarjeta, pill de estado, hoja inferior).
3. Envío: cola por empresa con una pausa aleatoria de 8 a 20 segundos entre mensajes, tope diario configurable (por defecto 200), solo a clientes registrados en el CRM, y sin reenviar el mismo mensaje al mismo número el mismo día. Cada cliente puede marcarse "No enviar WhatsApp".
4. Úsalo en todos los "Enviar por WhatsApp" del sistema: ticket y nota de entrega, presupuesto, recibo de abono, Corte Z, recibo de nómina, recordatorios de cobro, promociones y cumpleaños. Si la empresa no tiene WhatsApp vinculado, se mantiene el comportamiento actual (enlace wa.me).
5. Registro de envíos por empresa: fecha, cliente, tipo, estado (en cola, enviado, falló).
```
