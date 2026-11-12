# KR POS · Empieza aquí

Esta carpeta es todo lo que necesita Claude Code (Sonnet 5.5, esfuerzo bajo) para dejar KR POS igual a la preview.

## Pasos
1. Copia esta carpeta dentro del repositorio `APP NEW` con el nombre **`rediseno`**.
2. Pega el contenido de `rediseno/CLAUDE-reglas.md` al final de `AGENTS.md`.
3. Abre Claude Code en el repositorio. En cada sesión nueva pega:
   - el **Bloque A** completo de `rediseno/PROMPT-MAESTRO.md`, y debajo
   - **una** fase del Bloque B.
4. Empieza por la **Fase 0 (Base visual)**. Sigue el orden de `rediseno/BRECHAS-Y-PLAN.md` §6.
5. Una fase por sesión. Al terminar cada una, revisa en el navegador y haz commit en su rama.

## Qué es cada archivo
| Archivo | Para qué |
|---|---|
| `PROMPT-MAESTRO.md` | Lo que se pega en Claude Code: directrices fijas (Bloque A) y fases (Bloque B) |
| `PARIDAD-VISUAL.md` | Diferencias visuales ya verificadas pantalla por pantalla, medidas exactas y cómo comprobar |
| `BRECHAS-Y-PLAN.md` | Qué funciones faltan por módulo y el orden de las 24 fases |
| `ESPECIFICACION.md` | Qué debe tener y cómo debe comportarse cada módulo |
| `CLAUDE-reglas.md` | Reglas cortas para `AGENTS.md` |
| `tokens.css` | Tabla de colores, tipografía, radios y sombras de la preview |
| `visual/capturas-2026-11-11/` | Capturas de la app real y de la preview, lado a lado, por módulo |
| `visual/contrato.json` y `visual/comparar.mjs` | Medidas obligatorias y el script que las comprueba |
| `referencia/` | Los 11 HTML de la preview, para abrir en el navegador |
| `referencia-lectura/` | Los mismos, sin imágenes incrustadas, para que el modelo los lea por tramos |

## Antes de las fases 19 y 22
- Fase 19 (Asistente IA): crea una clave de un proveedor gratuito y ponla en el servidor como `AI_API_KEY`, con `AI_BASE_URL` y `AI_MODEL`.
- Fase 22 (WhatsApp por QR): necesita el servidor propio con Docker; no funciona en funciones sin servidor.
