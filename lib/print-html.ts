import type { PrintPaperSize } from "@prisma/client";
import { pageRule, printBaseCss } from "@/lib/print-paper-sizes";

// Imprime un fragmento HTML ya armado (sin React) en un iframe oculto, con el
// mismo @page y estilos base que la vista previa (components/print/PrintFrame).
// Sirve para páginas sueltas como la prueba de impresión de Ajustes: nada de
// la app (menús, botones) llega a la hoja porque el documento vive aparte.
export function printHtmlDocument(bodyHtml: string, paperSize: PrintPaperSize, title = "Documento"): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    iframe.srcdoc = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body></body></html>";
    iframe.onload = () => {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc) {
        iframe.remove();
        reject(new Error("No se pudo preparar la impresión."));
        return;
      }
      doc.title = title;
      const style = doc.createElement("style");
      doc.head.appendChild(style);
      doc.body.innerHTML = `<div id="print-root">${bodyHtml}</div>`;
      const root = doc.getElementById("print-root")!;
      const heightMm = (root.getBoundingClientRect().height * 25.4) / 96;
      style.textContent = `${printBaseCss(paperSize)}\n${pageRule(paperSize, heightMm)}`;
      const done = () => {
        win.removeEventListener("afterprint", done);
        setTimeout(() => iframe.remove(), 500);
        resolve();
      };
      win.addEventListener("afterprint", done);
      win.focus();
      win.print();
      // Algunos navegadores no disparan afterprint: se limpia igual.
      setTimeout(() => {
        if (iframe.isConnected) done();
      }, 60_000);
    };
    document.body.appendChild(iframe);
  });
}
