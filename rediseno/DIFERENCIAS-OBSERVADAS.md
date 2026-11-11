# KR POS · Diferencias visuales observadas (app real frente a preview)

Comparación hecha el 11 de noviembre de 2026 con la app corriendo en local sobre la base de pruebas (empresa "Comercial Pruebas", usuario gerente), a 1440×900 y 390×844, tema claro. Cada punto es algo que **hoy se ve distinto** a la preview y hay que igualar.

No se pudieron comparar: tema oscuro, hojas y formularios abiertos, estados con datos en Presupuestos y Learning (la base de pruebas no tiene presupuestos ni videos), y las vistas internas de Administración.

Capturas de la preview: `visual/preview-capturas/`.

## Medidas reales tomadas en la app

| Elemento | Preview | App hoy |
|---|---|---|
| Título H1 (Inicio) | 38,4px | 36px |
| Eyebrow (Inicio) | peso 600 | peso 700 |
| Separación vertical entre bloques | 18px | 20px |
| Botones dentro de las pantallas | alto 40px, padding 14px | alto 34px y 32px, padding 14px y 10px |
| Radio de tarjeta | 19px | 19,6px |
| Radio del ítem del menú | 12px | 19,6px |
| Ancho del menú lateral | 260px | 260px ✔ |
| Ancho máximo del contenido | 1120px | 1120px ✔ |

## Menú lateral (todas las pantallas)

1. **Logo.** Preview: cuadro morado de 44px con "KR", al lado "KR POS" en 17px negrita y debajo el nombre del negocio. App: imagen del logotipo "krpos" con el nombre del negocio debajo.
2. **Sede activa.** Preview: bloque plano gris de radio 14px con "SEDE ACTIVA" y el nombre; no es un desplegable. App: selector en forma de píldora con flecha.
3. **Ítem activo.** Preview: fondo y texto del **color de cada módulo** (POS verde azulado, Inventario naranja, Caja verde, Estadísticas rosa…). App: siempre lila de marca.
4. **Iconos.** Son otros. Preview: casa (Inicio), caja registradora (POS), caja (Inventario), documento (Presupuestos), caja de dinero (Caja Chica), barras (Estadísticas), megáfono (Marketing), maletín (Administración), tienda (Sucursales), destello (Asistente IA), birrete (Learning), engranaje (Ajustes). Tomar los trazos del objeto `IC` de la referencia 00.
5. **Módulo de más.** La app muestra "Documentos"; la preview no.
6. **El menú no cabe.** A 900px de alto la app corta la lista ("Asistente IA" queda tapado por el pie y hay que desplazar). En la preview los 12 módulos, el plan, la tasa y el usuario caben sin desplazar.
7. **Pie.** Preview, en este orden: pill "Plan … · N usuarios", pill "Tasa Bs …", botón ancho "Bloquear pantalla" de 38px, y fila de usuario (avatar circular de 38px, nombre, rol). App: plan y tasa dentro de una caja gris, fila de usuario, y debajo una fila de cuatro iconos (tema, candado, salir, colapsar).
8. **Tema claro/oscuro.** Preview: botón circular flotante de 40px arriba a la derecha del contenido. App: icono en el pie del menú.

## Teléfono (390px)

9. **Barra superior.** La app muestra una barra con menú, logotipo, nombre del negocio y lupa. La preview no tiene barra superior: el contenido empieza arriba.
10. **Hoja "Más".** Preview: título "Todos los módulos", botón de cerrar circular, cuadrícula de 3 columnas con icono en cuadro de color por módulo, y al final "Modo claro / oscuro" y "Bloquear pantalla". Verificar la de la app contra `00-hoja-mas-telefono.jpg`.

## Acceso

11. Falta el **cuadro del logo** (60px, radio 19px) con el nombre del negocio encima de "Bienvenido".
12. Sobran: el texto "Entra a tu negocio", el botón "Instalar app", el desplegable "¿Qué es KR POS?" y los enlaces legales al pie. Reubicarlos fuera de la tarjeta sin alterar su diseño (por ejemplo, enlaces legales en una línea discreta bajo la tarjeta ya existe; "Instalar app" pasa a Ajustes).
13. La etiqueta dice "Contraseña"; en la preview dice "Clave". "¿Olvidaste tu contraseña?" va abajo, junto a "Crear cuenta", separados por "·", no al lado de la etiqueta.
14. Falta el separador "o" y el botón "Continuar con Google" (aparece solo si Google está configurado; debe verse siempre que lo esté).
15. Falta el paso **"¿Quién eres?"** dentro de la misma tarjeta. La app pasa a "Elige tu sucursal" y luego a otra pantalla.
16. El control de seguridad (Turnstile) rompe la tarjeta. Debe ir en modo invisible o gestionado, sin ocupar espacio visible.
17. La mini-maqueta del panel izquierdo aparece **inclinada**; en la preview va recta.

## Selección de perfil, PIN y bloqueo

18. La app muestra una tarjeta clara centrada con iniciales. La preview usa **pantalla completa con degradado oscuro morado→rosa**, candado pequeño, reloj grande de peso fino, fecha, "Pantalla bloqueada · toca tu usuario", y cada usuario en una **fila de vidrio esmerilado** con foto, nombre y rol.
19. PIN: la app muestra 6 puntos y "4 a 6 números"; la preview, **4 puntos** y teclas circulares de vidrio con letras bajo cada número.

## Inicio

20. Falta el icono de calendario dentro de la etiqueta del periodo.
21. En el desglose, la última ficha (Comisiones) va con fondo verde suave en la preview; en la app es blanca.
22. Iconos de accesos rápidos: preview en **cuadro de 44px con radio 14px**; app en círculo.
23. Lista "Lo que no puede esperar": los botones de acción miden 32px (deben ser 40px) y el punto de color no lleva el halo de la preview.
24. La línea "Calculada con los días que ya tienen cierre de caja." no está en la preview. Se conserva por decisión del dueño (D7), en 12px gris bajo el desglose.

## POS

25. Buscador: la preview dice "Buscar producto, SKU o escanear (/)" y no tiene botón "Escanear" aparte.
26. **Orden de los precios.** Preview: moneda de referencia grande ($14,00) y bolívares pequeño debajo. App: bolívares grande y referencia pequeña. Aplica a tarjetas de producto, carrito y total.
27. Carrito vacío: la preview muestra icono de carrito, "Aún no hay productos" y "Toca un producto para agregarlo".
28. Pie del carrito: la preview muestra fila "Subtotal", luego "Total estimado" grande a la izquierda y "Equivalente Bs …" a la derecha. La app muestra "Total" y el monto a la derecha.
29. Botones finales: "En espera" con icono de pausa y "Cobrar $0,00" con el monto dentro del botón.
30. "Registrar cliente" y "Directorio" llevan icono en la preview.

## Inventario

31. Junto a "N productos" falta la **barra de uso del plan** ("12 de 200 productos" + barra + "Plan Emprende").
32. Fila de acciones. Preview: Nuevo producto · Actualizar inventario · Importar · Lista de reposición · Lista de precios · Exportar Excel. App: Nuevo producto · Actualizar inventario · Importar · Traspasos · Consumo interno · Descargar lista de precios, y deja "Lista de reposición" y "Exportar Excel" en la fila del buscador.
33. Filtros. Preview: chips de estado, buscador y categorías **en una sola fila**. App: en dos filas.
34. Falta el aviso flotante arriba a la derecha "N productos necesitan reposición · Reponer".
35. Precios en la tabla: referencia grande y bolívares pequeño (igual que el punto 26).

## Presupuestos

36. El selector de periodo va **debajo del título, a la izquierda**, con su etiqueta de periodo; en la app está a la derecha del título y sin etiqueta.
37. Barras del embudo con color por etapa (marca, verde azulado, naranja, verde); en la app son grises.
38. Los presupuestos se muestran como **tarjetas en cuadrícula** (cliente, número, total, pills de vigencia y % de cierre, sugerencia, botones Facturar / Enviar / Ver y menú ⋯). Verificar con datos: la base de pruebas no tiene presupuestos.
39. El filtro dice "Aprobado"; en la preview dice "Convertido".

## Caja Chica

40. La tarjeta "Estado de la caja" lleva **a la derecha**: pill de estado, "Abrir caja", "Generar Corte Z" y "Cerrar caja". En la app esos botones están más abajo, junto a un campo de fecha.
41. Orden de bloques en la preview: Estado de la caja (con Historial y Movimientos) → tres KPI → fila "Días pendientes por cerrar" → "Ventas del día" con filtros de canal, estado y periodo y su tabla. La app intercala bloques que la preview no tiene: campo de fecha, "Total vendido / Ventas", "Estado de cobro" y la tarjeta "Caja Chica · Efectivo del día". Reubicarlos dentro del cierre (hoja "Cerrar caja") o del Corte Z.

## Estadísticas

42. El selector de periodo va bajo el título, a la izquierda.
43. Faltan las **tres pills verdes de comparación** ("Ventas +12,4 % vs. periodo anterior"…).
44. KPI. Preview: fila de 3 (Ventas, Venta promedio, Gastos) y fila de 2 (Pedidos, Clientes nuevos). App: fila de 5 y fila de 4 con otros indicadores (Ingresos totales, Por cobrar, Costo, Gastos, Comisiones, Margen bruto).
45. "Ganancia neta estimada" y "Cascada de utilidad" no están en Estadísticas en la preview: viven en Administración → Balance → Resumen.

## Marketing

46. La pantalla es otra. Preview: pill "CRM" → 4 KPI → fila con interruptor "Exigir nombre y teléfono en cada venta" y botones Importar Excel / Plantilla / Añadir cliente → dos columnas (Mapa de clientes a la izquierda, Agenda de contactos a la derecha) → tabla "Clientes" con buscador. App: lista "Clientes a contactar" y debajo lista con panel de detalle.

## Administración

47. La pantalla es otra. Preview: pills de tasa y periodo → **cinco tarjetas de grupo** en fila (Balance activa en morado, Cuentas Bancarias, Compras, Consumo Interno, Contabilidad) → chips de sub-pestaña → selector de periodo → contenido. App: buscador y siete tarjetas de enlace a otras páginas.

## Sucursales

48. Falta el selector de periodo bajo el título y el botón "Nueva sucursal" a la derecha. Sobra el párrafo descriptivo bajo el título.
49. En "Lo que no puede esperar" falta el botón "Ver sede" a la derecha de cada aviso.
50. Tarjetas de sede: faltan la dirección con icono de ubicación, el menú ⋯, la mini-gráfica de tendencia junto a las ventas y la pill de horario ("Abierta desde 8:02 a. m.").

## Asistente IA

51. Con el asistente sin activar la app solo muestra un aviso. Preview: pestañas Asistente · Créditos · Historial, selector de rol, icono central, título "¿Qué hacemos hoy por tu negocio?", seis tarjetas de acción en cuadrícula de 4 columnas y barra de escritura con micrófono y botón de enviar circular.

## Ajustes

52. Bajo el título la preview muestra dos pills (tasa y "% listo"). La app muestra dos cajas: "Código de empresa y empleados" y "Suscripción mensual vence el…". Llevar ese contenido a Equipo y Seguridad y a Mi Plan.
53. La guía tiene **6 pasos** en la preview y 5 en la app.
54. Orden de las tarjetas de sección. Preview: Marca · Negocio · Pagos y Moneda / Equipo y Seguridad · Impresión y Datos · Mi Plan. App: Mi Plan · Marca · Negocio / Pagos y Moneda · Equipo y Seguridad · Impresión y Datos.

## Learning

55. Sin videos la app muestra solo un aviso. Con videos debe verse como `08-learning.jpg`: reproductor a la izquierda, a la derecha anillo de avance, "Tu ruta" con chips por rol y la lista numerada de módulos; debajo título, acciones (Hacer el quiz, Practicar en mi sistema, Preguntar al Asistente IA) y "Lo que aprendes".
