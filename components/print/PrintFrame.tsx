"use client";

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import type { PrintPaperSize } from "@prisma/client";
import { isThermal, pageRule, printBaseCss, printGeometry, printPageHeightMm, printShellHtml } from "@/lib/print-paper-sizes";

export type PrintFrameHandle = { print: () => Promise<void> };

const MM_TO_PX = 96 / 25.4;

// Vista previa Y hoja impresa del MISMO documento. El contenido se dibuja
// dentro de un iframe propio (con los estilos de la app copiados, la regla
// @page del tamaño elegido y márgenes reales). La vista previa que ve el
// usuario es ese iframe, y «Imprimir» llama al print() de ese mismo iframe:
// lo impreso es exactamente lo previsualizado, sin menús ni botones de la app
// y sin depender de que el diálogo/modal se pueda imprimir.
//
// Tickets (58/80 mm): la hoja se fija al alto medido del contenido
// (@page size: Wmm Hmm) para que la impresora corte justo al final.
// Carta/A4: hoja fija con márgenes; las filas no se parten entre páginas.
export function PrintFrame({
  paperSize,
  title,
  children,
  ref,
  className,
}: {
  paperSize: PrintPaperSize;
  title: string;
  children: React.ReactNode;
  ref?: Ref<PrintFrameHandle>;
  className?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pageStyleRef = useRef<HTMLStyleElement | null>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [contentMm, setContentMm] = useState<number | null>(null);
  const [availPx, setAvailPx] = useState(0);
  const g = printGeometry(paperSize);
  const thermal = isThermal(paperSize);

  const onLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.title = title;
    // Copia los estilos de la app (Tailwind) para que las clases del
    // documento se vean igual dentro del iframe.
    doc.head.querySelectorAll("[data-copied]").forEach((n) => n.remove());
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((n) => {
      const c = n.cloneNode(true) as HTMLElement;
      c.setAttribute("data-copied", "1");
      doc.head.appendChild(c);
    });
    // Variables de fuente (next/font) y clases del tema viven en <html>/<body>.
    doc.documentElement.className = document.documentElement.className.replace(/\bdark\b/g, "");
    doc.documentElement.setAttribute("lang", "es");
    doc.body.className = document.body.className;
    const style = doc.createElement("style");
    style.setAttribute("data-page", "1");
    doc.head.appendChild(style);
    pageStyleRef.current = style;
    doc.body.innerHTML = printShellHtml(paperSize);
    setMountNode(doc.getElementById("print-root"));
  }, [title, paperSize]);

  // Ancho disponible para escalar la hoja dentro del diálogo.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvailPx(el.clientWidth));
    ro.observe(el);
    setAvailPx(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Mide el contenido (alto en mm) y aplica base + @page.
  useEffect(() => {
    if (!mountNode) return;
    const style = pageStyleRef.current;
    if (!style) return;
    const measure = () => {
      // Alto total del documento = contenido + padding vertical (solo tickets).
      const mm = mountNode.getBoundingClientRect().height / MM_TO_PX + (thermal ? 2 * g.marginMm : 0);
      setContentMm((prev) => (prev != null && Math.abs(prev - mm) < 0.2 ? prev : mm));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(mountNode);
    return () => ro.disconnect();
  }, [mountNode, paperSize, thermal, g.marginMm]);

  useEffect(() => {
    const style = pageStyleRef.current;
    if (!style || !mountNode) return;
    style.textContent = `${printBaseCss(paperSize, thermal ? (contentMm ?? undefined) : undefined)}\n${pageRule(paperSize, thermal ? (contentMm ?? undefined) : undefined)}`;
  }, [mountNode, paperSize, contentMm, thermal]);

  useImperativeHandle(
    ref,
    () => ({
      async print() {
        const win = iframeRef.current?.contentWindow;
        const doc = iframeRef.current?.contentDocument;
        if (!win || !doc) return;
        // Espera estilos, fuentes e imágenes antes de abrir el diálogo.
        const links = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
        await Promise.all(
          links
            .filter((l) => !l.sheet)
            .map((l) => new Promise<void>((res) => { l.addEventListener("load", () => res(), { once: true }); l.addEventListener("error", () => res(), { once: true }); }))
        );
        await doc.fonts?.ready;
        await Promise.all(Array.from(doc.images).map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => undefined))));
        win.focus();
        win.print();
      },
    }),
    []
  );

  const widthPx = g.pageWidthMm * MM_TO_PX;
  const scale = availPx > 0 ? Math.min(1, availPx / widthPx) : 1;
  const heightMm = thermal ? printPageHeightMm(contentMm ?? 40) : (g.pageHeightMm ?? 0);
  const heightPx = heightMm * MM_TO_PX;

  return (
    <div ref={wrapRef} className={className} style={{ width: "100%", minWidth: 0, overflow: "hidden" }}>
      <div
        style={{
          width: widthPx * scale,
          height: heightPx * scale,
          margin: "0 auto",
          boxShadow: "0 1px 4px rgba(0,0,0,.25)",
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <iframe
          key={paperSize}
          ref={iframeRef}
          title={title}
          srcDoc={'<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'}
          onLoad={onLoad}
          scrolling="no"
          style={{
            width: widthPx,
            height: heightPx,
            border: 0,
            display: "block",
            background: "#fff",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
      {mountNode && createPortal(children, mountNode)}
    </div>
  );
}
