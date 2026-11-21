"use client";

import "@/components/settings/my-plan.css";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CopyIcon, FileTextIcon, MailIcon } from "lucide-react";
import { WhatsappIcon } from "@/components/ui/whatsapp-icon";
import { getPaymentShare, resendPaymentReportEmail, type PaymentShare } from "@/lib/actions/payment-share";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_TXT = { PENDING: "Pendiente de revisión", APPROVED: "Aprobado", REJECTED: "Rechazado" } as const;
const STATUS_CLS = { PENDING: "warn", APPROVED: "ok", REJECTED: "bad" } as const;

// Información de un pago reportado y cómo hacérselo llegar a soporte. WhatsApp es el método principal:
// abre el chat con el número de soporte con el mensaje ya escrito (empresa, monto, referencia, código y
// enlace al PDF con el comprobante) y además descarga el PDF por si se quiere adjuntar.
export function PaymentShareActions({ reportId }: { reportId: string }) {
  const [share, setShare] = useState<PaymentShare | null | undefined>(undefined);
  const [sending, startSend] = useTransition();

  useEffect(() => {
    let alive = true;
    getPaymentShare(reportId).then((s) => alive && setShare(s)).catch(() => alive && setShare(null));
    return () => {
      alive = false;
    };
  }, [reportId]);

  if (share === undefined) return <p className="kp-muted" style={{ fontSize: 13 }}>Preparando la información de tu pago…</p>;
  if (share === null) return <p className="kp-muted" style={{ fontSize: 13 }}>No pudimos cargar la información de este pago.</p>;
  const s = share;

  function sendWhatsApp() {
    // Se abre primero (dentro del clic) para que el navegador no lo bloquee; luego se descarga el PDF.
    window.open(s.whatsappUrl, "_blank", "noopener,noreferrer");
    const a = document.createElement("a");
    a.href = s.pdfUrl;
    a.download = `pago-${s.code}.pdf`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast.success("Se abrió WhatsApp con tu mensaje. Si quieres, adjunta el PDF que se descargó.");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(s.text);
      toast.success("Mensaje copiado.");
    } catch {
      toast.error("No pudimos copiarlo. Selecciónalo y cópialo a mano.");
    }
  }

  function resend() {
    startSend(async () => {
      const r = await resendPaymentReportEmail(s.reportId);
      if (r.success) toast.success("Reenviamos tu comprobante por correo a KR System.");
      else toast.error(r.error);
    });
  }

  return (
    <div className="kp" style={{ gap: 12 }}>
      <div className="kp-card" style={{ boxShadow: "none", padding: 0 }}>
        <div className="kp-row" style={{ justifyContent: "space-between" }}>
          <b>{s.concept}</b>
          <span className={`kp-st ${STATUS_CLS[s.status]}`}>{STATUS_TXT[s.status]}</span>
        </div>
        <div className="kp-muted" style={{ fontSize: 13, marginTop: 4 }}>
          {usd(s.amountUsdCents)} · {s.methodLabel} · ref. {s.reference || "—"} · código {s.code}
        </div>
        <div className="kp-muted" style={{ fontSize: 12, marginTop: 2 }}>
          Reportado el {new Date(s.reportedAt).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}
        </div>
      </div>

      <div className="kp-row">
        <button type="button" className="kp-btn primary" onClick={sendWhatsApp}>
          <WhatsappIcon /> Enviar por WhatsApp
        </button>
        <a className="kp-btn" href={s.pdfUrl} target="_blank" rel="noopener noreferrer">
          <FileTextIcon aria-hidden /> Ver PDF
        </a>
        <button type="button" className="kp-btn" onClick={copy}>
          <CopyIcon aria-hidden /> Copiar mensaje
        </button>
        {s.status === "PENDING" && (
          <button type="button" className="kp-btn" onClick={resend} disabled={sending}>
            <MailIcon aria-hidden /> {sending ? "Reenviando…" : "Reenviar por correo"}
          </button>
        )}
      </div>
      <p className="kp-note" style={{ margin: 0 }}>
        Al enviarlo por WhatsApp, el mensaje ya lleva todos los datos y un enlace al PDF con tu comprobante para que soporte lo verifique más rápido.
      </p>
    </div>
  );
}
