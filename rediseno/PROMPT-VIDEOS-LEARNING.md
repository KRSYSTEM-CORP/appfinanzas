# Prompt maestro · 10 videos de KR POS para el módulo Learning

Pega este documento completo a la herramienta o al agente que producirá los videos. Está escrito para que
no tenga que preguntar nada: define el objetivo, las especificaciones técnicas, la identidad visual, la voz,
la música, las herramientas, los 10 guiones y la lista de control de calidad.

---

## 1. Rol y objetivo

Eres un equipo de producción audiovisual (dirección creativa, guionista, motion designer, locutor, editor de
sonido y control de calidad). Produce **10 videos MP4 explicativos** de **KR POS** (sistema de ventas,
inventario, caja, estadísticas, marketing y administración para emprendedores y pequeñas empresas en
Venezuela) para publicarlos en el módulo **Learning** de la propia aplicación.

El espectador es un dueño de negocio, un cajero o un vendedor que **no es técnico**. Al terminar cada video
debe poder hacer la tarea él solo. Los videos deben ser dinámicos, claros y agradables de ver completos, de
modo que dé gusto avanzar por todo el módulo (el módulo marca cada video como visto y muestra un anillo de
avance).

Éxito = que el usuario entienda a la primera, no se aburra, y quiera ver el siguiente.

## 2. Especificaciones técnicas (obligatorias)

| Aspecto | Valor |
|---|---|
| Formato | MP4, video H.264 (High profile), audio AAC-LC 192 kbps, estéreo, 48 kHz |
| Resolución | 1920×1080, 16:9, 30 fps, píxeles cuadrados |
| Duración | **59 segundos por video** (entre 0:57 y 0:59; ninguno pasa de 59 s) |
| Peso | **Menos de 250 MB por archivo** (el límite de la aplicación es 300 MB); objetivo 40–120 MB con CRF 20–23 |
| Streaming | `-movflags +faststart` (para que empiece a reproducirse al instante) |
| Zona segura | Todo texto importante dentro del 90 % central; deja libre la franja inferior para subtítulos |
| Subtítulos | Español, incrustados (quemados) en el video **y** un archivo `.srt` aparte por video |
| Audio | Locución −16 LUFS integrados, música de fondo −26 a −30 LUFS bajo la voz, picos < −1 dBTP |
| Idioma | Español neutro latinoamericano, cercano; sin modismos de otro país |
| Accesibilidad | Contraste AA en textos, sin destellos más de 3 veces por segundo, no depender solo del color |

Máximo permitido por la aplicación: **10 videos** en total. No produzcas más.

## 3. Identidad visual (usa exactamente esto)

Fuente: **Hanken Grotesk** (Google Fonts; pesos 500, 700, 800). Números con cifras tabulares.
Esquinas redondeadas generosas (radio 19–24 px en tarjetas, píldoras totalmente redondas).
Sombras suaves y neutras (nunca resplandores de color). Movimiento con curvas `cubic-bezier(0.23, 1, 0.32, 1)`.

Paleta (la misma de la app):

| Uso | Claro | Oscuro |
|---|---|---|
| Fondo | `#f5f7fb` | `#0d0f18` |
| Texto | `#1d1d1f` | `#f2f3f8` |
| Color de marca / acción | `#433ddd` | `#7b76ff` |
| Éxito | `#1f8a3c` | `#5fdc82` |
| Aviso | `#9a5b00` | `#ffc15c` |
| Error | `#d70015` | `#ff7a70` |

Color por módulo (úsalo como acento del video que le corresponde):
Inicio `#433ddd` · POS `#0f9d9a` · Inventario `#ff9f0a` · Presupuestos `#7a3ff2` · Caja Chica `#34c759` ·
Estadísticas `#d6407f` · Marketing `#e0409a` · Administración `#1d4ed8` · Sucursales `#c2410c` ·
Asistente IA `#6655e5` · Learning `#0f7a8a` · Ajustes `#6e6e73`.

Estilo: limpio, moderno, tipo "producto premium". Alterna **pantallas reales de la app** (capturas o
grabaciones en 1440 px de ancho, también en versión móvil dentro de un marco de teléfono) con **gráficos de
movimiento** (resaltados, flechas, zoom a la zona que se explica, contadores animados, check verde al
completar un paso). Fondos con degradados suaves del color del módulo y formas geométricas flotando muy
sutiles. Nada de plantillas genéricas ni imágenes de stock de oficinas.

## 4. Herramientas y cómo usarlas

Usa todo lo disponible, cada una para lo que mejor hace:

1. **Remotion** (skills `remotion-best-practices`, `remotion-create`, `remotion-render`): motor principal.
   Una composición por video, escenas con `<Series>`/`<Sequence>`, texto y gráficos como React, tipografía
   local, subtítulos desde un JSON. Render final con `npx remotion render --codec=h264 --crf=21`.
2. **Capturas reales de la aplicación**: Playwright o el navegador integrado contra la versión de pruebas
   (empresa «Comercial Pruebas», datos ficticios; **nunca datos de clientes reales**). Captura en 1440×900
   y 390×844 (móvil), claro y oscuro. Graba los clics para animar el cursor sobre la captura (cursor con
   pulsación visible).
3. **Locución**: **voz de mujer latina, dulce, fluida y natural**, tono cálido y cercano como una amiga que
   explica con paciencia (sin sonar a locutora de anuncio ni robótica), acento latinoamericano neutro, sin
   voseo. Genérala con el generador de audio disponible (por ejemplo `generate_audio` de Higgsfield con voz
   de mujer en español) o con un TTS neuronal de alta calidad; escucha una muestra y elige la que mejor
   cumpla esas características antes de producir. Una sola voz para los 10 videos. Ritmo natural de
   ~140 palabras por minuto, pausas cortas en las comas, entonación que sube levemente en las preguntas y
   baja al cerrar cada idea. Entrega cada frase como clip separado con su duración para sincronizar escenas.
   Evita las voces del sistema operativo (macOS «say») para la versión final.
4. **Música**: pista instrumental original o con licencia libre, 100–118 BPM, optimista y tecnológica
   (piano suave + bajo + percusión ligera), **sin letra**. Una pista distinta por video pero de la misma
   familia sonora; intro de 2 s con acento, cuerpo estable y cierre con resolución. Registra la fuente y la
   licencia de cada pista en `CREDITOS.md`.
5. **Mezcla (ffmpeg)**: normaliza la voz a −16 LUFS, aplica *ducking* (la música baja 12 dB mientras habla la
   voz y vuelve en 300 ms), recorta silencios largos, añade 15 ms de fundido a cada clip de voz.
6. **Efectos de sonido** discretos: «tic» al hacer clic, «pop» al aparecer tarjetas, «ding» suave al
   completar (máximo uno cada 5 s).
7. **Subtítulos**: genera `.srt` desde el guion exacto, divídelos en líneas de máximo 42 caracteres y 2
   líneas, sincronizados con la voz; luego quémalos en el video con la fuente de la marca.
8. **Revisión visual**: extrae un fotograma cada 2 s con ffmpeg y revisa que nada se corte, se desborde ni
   quede ilegible; escucha la mezcla completa.

Si una herramienta no está disponible, usa la alternativa más cercana y anótalo en `CREDITOS.md`; no
detengas la producción.

## 5. Estructura que debe tener cada video (59 segundos)

1. **Gancho (0:00–0:06)**: pregunta o problema real del negocio, con un golpe visual y musical.
2. **Demostración en 3 o 4 pasos (0:06–0:48)**: un paso por escena, de 8 a 12 s cada uno; en pantalla se
   resalta exactamente lo que la voz dice; cada paso lleva su cartel numerado.
3. **Consejo o dato clave (0:48–0:54)**: un truco o error común que evitar (solo una frase).
4. **Cierre (0:54–0:59)**: check de éxito, resumen en una línea y «Siguiente video: …».

Locución: **de 100 a 125 palabras por video** (≈ 46 s de voz) para que quepan las pausas y la música.

Reglas de ritmo: cada 3–5 s algo cambia en pantalla (zoom, resaltado, cambio de escena); ninguna escena
estática más de 5 s; transiciones rápidas y limpias (corte, deslizamiento corto, zoom suave), sin efectos
exagerados.

Reglas de redacción: frases cortas (máximo 18 palabras), voz activa, nombra los botones tal como aparecen en
la aplicación, números y montos con el formato venezolano (Bs 1.234,56 · $ 12,99), nunca prometas funciones
que no existan (lo que está bloqueado se llama «Próximamente»: p. ej. la factura fiscal).

## 6. Los 10 videos (orden de producción y guion base)

Cada uno lleva: **título**, **público** (Todo, Dueño, Cajero, Vendedor o Contador, como pide el módulo),
**qué aprenderás** (3 puntos, van al campo «learns» de Learning) y el guion base. Desarrolla el guion
completo con el formato de la sección 5 y **respeta los 59 segundos**: si algo no cabe, se recorta,
no se acelera la voz.

1. **Bienvenido a KR POS: tu negocio en una pantalla** · Todo · 0:59
   Aprenderás: dónde está cada módulo · cómo leer Inicio (ganancia neta, accesos) · cómo cambiar período y
   sucursal. Recorrido por la barra lateral, Inicio, tema claro/oscuro y pantalla de bloqueo.
2. **Tu primera venta en el POS (paso a paso)** · Cajero, Vendedor · 0:59
   Aprenderás: buscar y agregar productos · elegir método de pago y cobrar · entregar ticket o nota.
   Carrito, cliente, los 3 pasos del cobro, pagos mixtos, descuento, venta a crédito, confetti final.
3. **Cobros avanzados: descuentos, cupones, crédito y exoneradas** · Cajero, Dueño · 0:59
   Aprenderás: aplicar descuento por % o monto · canjear un cupón de un cliente · vender a crédito y cobrar
   después. Incluye el error cuando el cupón está mal escrito.
4. **Inventario: productos, existencias y lista de precios** · Dueño · 0:59
   Aprenderás: crear productos con imagen · cargar y actualizar por Excel · exportar el catálogo en PDF con
   imágenes. Alertas de stock bajo.
5. **Compras y proveedores: de la orden a la factura** · Dueño, Contador · 0:59
   Aprenderás: registrar una compra · comparar proveedores · crear una orden de pago de varias facturas.
6. **Caja Chica: abrir, cerrar y cuadrar el día** · Dueño, Cajero · 0:59
   Aprenderás: abrir caja · registrar entradas y salidas · hacer el Corte Z y revisar el historial.
7. **Estadísticas: lo que de verdad importa** · Dueño · 0:59
   Aprenderás: leer ventas, ganancia y margen · usar «Rendimiento de productos» (más y menos vendidos) ·
   entender el punto de equilibrio y el ritmo de ventas.
8. **Marketing: clientes, grupos y promociones por WhatsApp** · Dueño, Vendedor · 0:59
   Aprenderás: entender los grupos de clientes · crear una promoción para todos, un grupo, cumpleañeros de un
   período o clientes elegidos · enviarla por WhatsApp y seguir los canjes.
9. **Administración y contabilidad sin complicarte** · Dueño, Contador · 0:59
   Aprenderás: leer el Balance y la composición de gastos · cuentas por cobrar y por pagar · activar o
   desactivar el IVA y exportar los libros.
10. **Sucursales, equipo, plan y Asistente IA** · Dueño · 0:59
    Aprenderás: administrar sucursales y claves · crear usuarios y roles · elegir tu plan (primer mes de
    Emprende a $9,99, luego $12,99, a tasa dólar BCV) y preguntar al Asistente IA.

## 7. Entregables y nombres

Carpeta `videos-learning/` con, por cada video `NN` (01 a 10):

- `NN-titulo-en-minusculas.mp4` (final, con subtítulos quemados)
- `NN-titulo-en-minusculas.srt`
- `NN-miniatura.jpg` (1280×720, título grande y color del módulo)
- `NN-ficha.json` con `{ "title", "description" (1–2 frases), "audience", "learns": [3 puntos], "duration" }`
  para pegar en el formulario «Agregar video» del módulo Learning (campos título, descripción, público y
  «lo que aprenderás»).

Además: `CREDITOS.md` (fuentes y licencias de música y efectos, herramientas usadas), `guiones/NN.md` con el
guion final locutado y `informe-calidad.md` con el resultado de la sección 8.

## 8. Control de calidad (no entregues sin pasar todo)

- [ ] 1920×1080, 30 fps, H.264 + AAC, `faststart`, menos de 250 MB y **duración ≤ 59,0 s** (verifica con `ffprobe`).
- [ ] La voz se entiende claramente sobre la música en altavoz de teléfono y en audífonos.
- [ ] Niveles: voz −16 LUFS, sin picos que saturen, música nunca tapa la voz.
- [ ] Lo que dice la voz coincide con lo que se ve, segundo a segundo.
- [ ] Todos los nombres de botones y montos coinciden con la aplicación actual.
- [ ] Ningún dato real de clientes, correos, teléfonos ni claves en pantalla.
- [ ] Nada se corta, se desborda ni queda fuera de la zona segura (revisión de fotogramas cada 2 s).
- [ ] Los subtítulos no tapan elementos importantes y no tienen faltas de ortografía.
- [ ] Ritmo: ninguna escena estática más de 6 s; el video no cae en la monotonía.
- [ ] Cada video termina con un resumen y anuncia el siguiente.
- [ ] Las miniaturas se leen bien en tamaño pequeño.

Si algo falla, corrige y vuelve a renderizar; no entregues con excepciones.

## 9. Orden de trabajo sugerido

1. Capturas de la aplicación (claro y oscuro, escritorio y móvil) y banco de elementos gráficos.
2. Guiones finales de los 10 videos (aprobación del dueño antes de producir).
3. Locución y música de los 10.
4. Producir primero el video 2 (POS) como piloto; ajustar ritmo, mezcla y estilo con el dueño.
5. Producir el resto con la misma plantilla.
6. Control de calidad, entrega y carga en Learning (el dueño o el gerente sube los MP4 en Learning →
   «Agregar video»; la subida usa R2 cuando está configurado, o un enlace mientras tanto).
