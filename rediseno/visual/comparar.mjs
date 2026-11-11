// Comparación visual KR POS: preview frente a la app real.
// Uso (con la app corriendo contra la BASE DE PRUEBAS, nunca producción):
//   E2E_BASE_URL=http://localhost:3000 KR_STORAGE=tests/e2e/.auth.json node rediseno/visual/comparar.mjs [modulo]
// Produce en rediseno/visual/salida/:
//   <modulo>-<vista>-<tema>-preview.png y -app.png   (para verlas lado a lado)
//   informe.json                                      (reglas del contrato que NO se cumplen)
// Sale con código 1 si alguna regla falla.
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const contrato = JSON.parse(readFileSync(join(here, "contrato.json"), "utf8"));
const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const storage = process.env.KR_STORAGE; // sesión guardada de un usuario Dueño/Gerente de pruebas
const solo = process.argv[2];
const out = join(here, "salida");
mkdirSync(out, { recursive: true });

const vistas = { desktop: contrato.desktop, mobile: contrato.mobile };
const temas = ["light", "dark"];
const fallos = [];
const browser = await chromium.launch();

for (const ruta of contrato.rutas) {
  if (solo && ruta.modulo !== solo) continue;
  for (const [vista, viewport] of Object.entries(vistas)) {
    for (const tema of temas) {
      const nombre = `${ruta.modulo}-${vista}-${tema}`;

      // 1) preview
      const cp = await browser.newContext({ viewport });
      const pp = await cp.newPage();
      const [archivo, resto = ""] = ruta.preview.split("?");
      await pp.goto(pathToFileURL(join(here, "..", "referencia", archivo)).href + "?" + resto);
      await pp.evaluate((t) => document.documentElement.setAttribute("data-theme", t), tema);
      await pp.waitForTimeout(600);
      await pp.screenshot({ path: join(out, `${nombre}-preview.png`), fullPage: true });
      await cp.close();

      // 2) app real
      const ca = await browser.newContext({ viewport, storageState: storage, colorScheme: tema });
      const pa = await ca.newPage();
      await pa.goto(base + ruta.app, { waitUntil: "networkidle" });
      await pa.evaluate((t) => document.documentElement.classList.toggle("dark", t === "dark"), tema);
      await pa.waitForTimeout(600);
      await pa.screenshot({ path: join(out, `${nombre}-app.png`), fullPage: true });

      // 3) contrato de estilos (solo en claro: los colores del contrato son los del tema claro)
      if (tema === "light") {
        for (const regla of contrato.reglas) {
          if (regla.solo && regla.solo !== vista) continue;
          const sel = regla.kr === "body" ? "body" : `[data-kr="${regla.kr}"]`;
          const el = pa.locator(sel).first();
          if ((await el.count()) === 0) continue; // el componente no aparece en esta pantalla
          if (!(await el.isVisible())) continue;
          const real = await el.evaluate((n, props) => {
            const cs = getComputedStyle(n);
            return Object.fromEntries(props.map((p) => [p, cs[p]]).concat([["fontFamily", cs.fontFamily]]));
          }, Object.keys(regla.css));
          for (const [prop, esperado] of Object.entries(regla.css)) {
            if (real[prop] !== esperado) fallos.push({ pantalla: nombre, componente: regla.kr, propiedad: prop, esperado, real: real[prop] });
          }
          if (regla.fontFamilyIncluye && !real.fontFamily.includes(regla.fontFamilyIncluye))
            fallos.push({ pantalla: nombre, componente: regla.kr, propiedad: "fontFamily", esperado: regla.fontFamilyIncluye, real: real.fontFamily });
        }
        // sin desbordes horizontales
        const desborde = await pa.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (desborde > 1) fallos.push({ pantalla: nombre, componente: "pagina", propiedad: "desbordeHorizontal", esperado: "0", real: String(desborde) });
      }
      await ca.close();
    }
  }
}
await browser.close();
writeFileSync(join(out, "informe.json"), JSON.stringify(fallos, null, 2));
console.log(fallos.length ? `FALLAN ${fallos.length} reglas. Ver rediseno/visual/salida/informe.json` : "Contrato visual: todo coincide.");
process.exit(fallos.length ? 1 : 0);
