import "server-only";
import https from "node:https";
import tls from "node:tls";
import { SECTIGO_DV_R36_PEM } from "@/lib/certs/sectigo-dv-r36";
import { parseBcvHome, type BcvHome } from "@/lib/bcv-parse";

// Descarga la página principal del BCV. Si esta lectura falla (red, cambio de la
// página, certificado), lib/bcv-rate.ts vuelve al agregador de siempre.

function getHtml(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { ca: [...tls.rootCertificates, SECTIGO_DV_R36_PEM], timeout: timeoutMs, headers: { "user-agent": "KR-POS/1.0" } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`BCV respondió ${res.statusCode}`));
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          body += c;
          if (body.length > 2_000_000) req.destroy(new Error("Respuesta demasiado grande"));
        });
        res.on("end", () => resolve(body));
      }
    );
    req.on("timeout", () => req.destroy(new Error("Tiempo agotado")));
    req.on("error", reject);
  });
}

export async function fetchBcvOfficial(): Promise<BcvHome> {
  const html = await getHtml("https://www.bcv.org.ve/", 5000);
  const parsed = parseBcvHome(html);
  if (!parsed) throw new Error("No se pudo leer la tasa de la página del BCV");
  return parsed;
}
