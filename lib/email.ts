import { Resend } from "resend";
import { buildPaymentMessage, type PaymentShareInfo } from "@/lib/payment-share";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.RESEND_FROM_EMAIL || "KR POS <noreply@krsystem-corp.com>";
const APP_URL = process.env.APP_URL || "https://krpos.krsystem-corp.com";
const LOGO_URL = `${APP_URL}/icons/icon-512.png`;

// Resend is optional in dev — if no API key is configured, reset links are
// logged to the server console instead of emailed, so the flow is still
// testable locally without an account. A delivery failure (e.g. Resend
// outage, unverified domain) is logged but never thrown — the reset token is
// already persisted by the time this runs, so a flaky email provider
// shouldn't surface as a broken "forgot password" flow to the user.
//
// bodyHtml is just the email-specific content — the logo header, container,
// and "KR POS — By KR System" footer are shared here so every email carries
// the same branding without each sender repeating that markup.
type EmailAttachment = { filename: string; content: string };

async function send(
  to: string,
  subject: string,
  bodyHtml: string,
  attachments?: EmailAttachment[],
): Promise<boolean> {
  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <img src="${LOGO_URL}" alt="KR POS" width="48" height="48" style="display: block; margin: 0 auto 20px; border-radius: 10px;" />
      ${bodyHtml}
      <p style="color: #888; font-size: 12px; margin-top: 32px; text-align: center;">KR POS — By KR System</p>
    </div>
  `;
  if (!resend) {
    // Sin llave no se envía; no se imprime el cuerpo (puede traer enlaces de restablecimiento) ni el correo completo.
    console.log(`[email] RESEND_API_KEY no configurada: no se envió "${subject}" a ${maskEmail(to)}`);
    return true;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html, ...(attachments?.length ? { attachments } : {}) });
    return true;
  } catch (err) {
    console.error(`[email] no se pudo enviar a ${maskEmail(to)}:`, err instanceof Error ? err.message : "error");
    return false;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendAnnouncementEmail(
  to: string,
  subject: string,
  message: string,
): Promise<boolean> {
  const bodyHtml = escapeHtml(message)
    .split("\n")
    .map((line) => `<p>${line || "&nbsp;"}</p>`)
    .join("");
  return send(to, subject, bodyHtml);
}

export async function sendSignupCodeEmail(to: string, code: string): Promise<void> {
  await send(
    to,
    "Tu código de verificación — KR POS",
    `
      <h2>Confirma tu correo</h2>
      <p>Usa este código para terminar de crear tu cuenta en KR POS:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; text-align: center; margin: 24px 0;">${code}</p>
      <p>Este código vence en 10 minutos. Si no intentaste crear una cuenta, puedes ignorar este correo.</p>
    `,
  );
}

export type PaymentReportContact = {
  name: string;
  phone: string;
  email?: string;
  references: string[];
  proofImageDataUrl?: string;
};

export type PaymentReportEmailInput = {
  share: PaymentShareInfo;
  reporterEmail: string | null;
  proofImageDataUrl: string | null;
  isResend?: boolean;
};

// Aviso de un pago reportado, para el buzón de pagos (PAYMENTS_NOTIFY_EMAIL). Lleva el mismo mensaje
// predeterminado que el cliente manda por WhatsApp, el enlace al PDF y el comprobante adjunto.
export async function sendPaymentReportEmail(to: string, input: PaymentReportEmailInput): Promise<void> {
  const { share, reporterEmail, proofImageDataUrl, isResend } = input;
  const amount = (share.amountUsdCents / 100).toLocaleString("es-VE", { style: "currency", currency: "USD" });
  const reviewUrl = `${APP_URL}/admin`;
  const phoneDigits = share.reporterPhone?.replace(/\D/g, "") ?? "";
  const waUrl = phoneDigits
    ? `https://wa.me/${phoneDigits.replace(/^0/, "58")}?text=${encodeURIComponent(
        `Hola ${share.reporterName ?? ""}, recibimos tu comprobante de pago de la suscripción de ${share.companyName}.`,
      )}`
    : null;
  const row = (k: string, v: string) =>
    `<tr><td style="padding:4px 14px 4px 0;color:#666">${k}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`;
  const proof = proofImageDataUrl?.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  const attachments = proof
    ? [{ filename: `comprobante-${share.companyName.replace(/[^\w-]+/g, "-")}.${proof[1] === "jpeg" ? "jpg" : proof[1]}`, content: proof[2] }]
    : undefined;
  const btn = "display:inline-block;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;margin:4px 6px 4px 0";
  await send(
    to,
    `${isResend ? "Reenvío: pago" : "Nuevo pago"} reportado — ${share.companyName} — ${amount} (${share.code})`,
    `
      <h2>${isResend ? "Pago reportado (reenviado por la empresa)" : "Nuevo pago reportado"}</h2>
      <p><strong>${escapeHtml(share.companyName)}</strong> reportó un pago por <strong>${amount}</strong>.</p>
      <table style="border-collapse:collapse;font-size:14px">
        ${row("Empresa", share.companyName)}
        ${row("Concepto", share.concept)}
        ${row("Monto", amount)}
        ${row("Método", share.methodLabel)}
        ${row("Referencia", share.reference?.trim() || "—")}
        ${row("Fecha del reporte", share.reportedAt.toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Caracas" }))}
        ${row("Reportado por", share.reporterName || "—")}
        ${row("Teléfono", share.reporterPhone || "—")}
        ${reporterEmail ? row("Correo", reporterEmail) : ""}
        ${row("Código", share.code)}
      </table>
      <p style="margin-top:18px">
        <a href="${escapeHtml(share.pdfUrl)}" style="${btn};background:#433ddd;color:#fff">Ver PDF con el comprobante</a>
        <a href="${reviewUrl}" style="${btn};background:#f1f1f7;color:#222">Revisar y aprobar</a>
        ${waUrl ? `<a href="${waUrl}" style="${btn};background:#25d366;color:#fff">Escribirle por WhatsApp</a>` : ""}
      </p>
      <p style="color:#666;font-size:13px">Mensaje que la empresa envía por WhatsApp:</p>
      <pre style="white-space:pre-wrap;background:#f6f6fa;padding:12px;border-radius:8px;font-size:13px">${escapeHtml(buildPaymentMessage(share))}</pre>
      <p style="color:#666;font-size:13px">El comprobante va adjunto. El acceso de la empresa se restablece automáticamente en cuanto apruebes el pago.</p>
    `,
    attachments,
  );
}

export async function sendCreditRequestEmail(
  to: string,
  companyName: string,
  credits: number,
  priceUsdCents: number,
  contact: PaymentReportContact & { method: string },
): Promise<void> {
  const amount = (priceUsdCents / 100).toLocaleString("es-VE", { style: "currency", currency: "USD" });
  const phoneDigits = contact.phone.replace(/\D/g, "");
  const waUrl = phoneDigits
    ? `https://wa.me/${phoneDigits.replace(/^0/, "58")}?text=${encodeURIComponent(
        `Hola ${contact.name}, recibimos tu comprobante de la recarga de ${credits} créditos de ${companyName}.`,
      )}`
    : null;
  const proof = contact.proofImageDataUrl?.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  const attachments = proof
    ? [{ filename: `comprobante-creditos-${companyName.replace(/[^\w-]+/g, "-")}.${proof[1] === "jpeg" ? "jpg" : proof[1]}`, content: proof[2] }]
    : undefined;
  await send(
    to,
    `Recarga de créditos IA por aprobar — ${companyName}`,
    `
      <h2>Recarga de créditos por aprobar</h2>
      <p><strong>${escapeHtml(companyName)}</strong> pagó <strong>${credits} créditos</strong> del Asistente IA por <strong>${amount}</strong> (${escapeHtml(contact.method)}).</p>
      <ul style="padding-left: 18px; color: #333;">
        <li>Nombre: <strong>${escapeHtml(contact.name)}</strong></li>
        <li>Teléfono: <strong>${escapeHtml(contact.phone)}</strong></li>
        ${contact.email ? `<li>Correo: <strong>${escapeHtml(contact.email)}</strong></li>` : ""}
        ${contact.references.length ? `<li>Referencia: <strong>${contact.references.map(escapeHtml).join(", ")}</strong></li>` : ""}
      </ul>
      ${waUrl ? `<p><a href="${waUrl}">Escribirle por WhatsApp</a></p>` : ""}
      <p>
        <a href="${APP_URL}/admin/aprobaciones" style="display: inline-block; background: #433ddd; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Revisar y aprobar
        </a>
      </p>
      <p>El comprobante va adjunto. Los créditos se suman a la empresa en cuanto apruebes.</p>
    `,
    attachments,
  );
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password/${token}`;
  await send(
    to,
    "Recupera tu contraseña — KR POS",
    `
      <h2>Recupera tu contraseña</h2>
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en KR POS.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; background: #433ddd; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Crear nueva contraseña
        </a>
      </p>
      <p>Este enlace vence en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.</p>
    `,
  );
}

// Reporte semanal de ventas (cuerpo ya armado por lib/weekly-report.ts).
export async function sendWeeklyReportEmail(to: string, subject: string, bodyHtml: string): Promise<boolean> {
  return send(to, subject, bodyHtml);
}

// "maria@correo.com" -> "m***@correo.com": los registros del servidor no guardan correos completos.
export function maskEmail(to: string | string[]): string {
  const one = Array.isArray(to) ? to[0] ?? "" : to;
  const [user, domain] = one.split("@");
  return domain ? `${user.slice(0, 1)}***@${domain}` : "***";
}
