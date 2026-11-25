import type { Metadata } from "next";
import Link from "@/components/ui/nav-link";
import { notFound } from "next/navigation";
import { verifyPaymentReportToken } from "@/lib/payment-link";
import { PaymentPdfFrame } from "@/components/billing/PaymentPdfFrame";

export const metadata: Metadata = { title: "Comprobante de pago · KR POS", robots: { index: false } };

// Visor interno del PDF de un pago reportado. Existe para que, dentro de la app (donde no hay botón de
// «atrás»), siempre haya una salida clara: «Regresar a KR POS». El PDF se sigue sirviendo desde la ruta
// pública firmada; aquí solo se verifica la misma firma antes de incrustarlo.
export default async function PaymentViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t } = await searchParams;
  if (!verifyPaymentReportToken(id, t)) notFound();
  const src = `/api/public/pagos/${encodeURIComponent(id)}?t=${encodeURIComponent(t ?? "")}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
        <Link href="/pos" className="kp-btn primary" style={{ textDecoration: "none" }}>
          ← Regresar a KR POS
        </Link>
        <a href={src} download={`pago-${id.slice(-8)}.pdf`} className="kp-btn" style={{ textDecoration: "none" }}>
          Descargar PDF
        </a>
      </div>
      <PaymentPdfFrame src={src} />
    </div>
  );
}
