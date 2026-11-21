"use client";

import { useEffect, useState } from "react";

// Muestra el PDF dentro de la página. Se descarga como blob porque las cabeceras de seguridad de la app
// (X-Frame-Options: DENY) impiden incrustar la ruta directamente; un blob: es del mismo origen y no las lleva.
export function PaymentPdfFrame({ src }: { src: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("pdf"))))
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (failed) return <p style={{ padding: 16 }}>No pudimos cargar el PDF. Usa «Descargar PDF».</p>;
  if (!url) return <p style={{ padding: 16 }}>Cargando el comprobante…</p>;
  return <iframe src={url} title="Comprobante de pago" style={{ flex: 1, width: "100%", border: 0 }} />;
}
