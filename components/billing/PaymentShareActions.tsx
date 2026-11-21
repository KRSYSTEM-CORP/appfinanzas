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
// enlace al PDF con el comprobante).
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
    // Se intenta abrir la app de WhatsApp (celular o escritorio): KR POS se queda donde está y no hay que
    // «volver». Si no hay app instalada, la página sigue visible y se abre WhatsApp Web en otra pestaña.
    const deep = s.whatsappUrl.replace("https://wa.me/", "whatsapp://send?phone=").replace("?text=", "&text=");
    let left = false;
    const mark = () => {
      left = true;
    };
    window.addEventListener("blur", mark, { once: true });
    document.addEventListener("visibilitychange", mark, { once: true });
    window.location.href = deep;
    window.setTimeout(() => {
      window.removeEventListener("blur", mark);
      document.removeEventListener("visibilitychange", mark);
      if (!left) window.open(s.whatsappUrl, "_blank", "noopener,noreferrer");
    }, 1500);
    toast.success("Abrimos WhatsApp con tu mensaje. Cuando termines, vuelve a KR POS desde aquí.");
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
        <a className="kp-btn" href={`/pago/${s.reportId}?t=${new URL(s.pdfUrl).searchParams.get("t") ?? ""}`}>
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
