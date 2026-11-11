import { MailIcon } from "lucide-react";
import { WhatsappIcon } from "@/components/ui/whatsapp-icon";
import { PortalHero } from "@/components/auth/PortalHero";
import { CONTACT_EMAIL, WHATSAPP_URL } from "@/lib/legal";

// Marco de acceso de la preview v15: tarjeta flotante centrada (radio 32) sobre un
// fondo con degradados y formas que flotan; mitad informativa a la izquierda y el
// formulario a la derecha, con el soporte (WhatsApp y correo) al pie.
export function AuthShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="auth-bg relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-3 pb-14 sm:p-5 sm:pb-14">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <i className="auth-b1" />
        <i className="auth-b2" />
        <i className="auth-b3" />
        <i className="auth-sq auth-s1" />
        <i className="auth-sq auth-s2" />
        <i className="auth-sq auth-s3" />
      </div>

      <div className="auth-card relative grid w-full max-w-[980px] overflow-hidden rounded-[32px] bg-card lg:min-h-[580px] lg:grid-cols-[1.05fr_1fr]">
        <PortalHero />
        <section className="flex min-w-0 flex-col justify-between gap-4 p-6 sm:p-8 lg:px-[38px] lg:py-[34px]">
          <div className="mx-auto flex w-full max-w-sm flex-col gap-3">{children}</div>
          <div className="flex items-center justify-center gap-2.5 border-t pt-3.5 text-[13px] font-semibold text-muted-foreground">
            <span>Soporte</span>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Soporte por WhatsApp" className="grid size-[38px] place-items-center rounded-full bg-[#25d366]/15 text-[#1faa59] transition-transform hover:-translate-y-0.5">
              <WhatsappIcon />
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} aria-label="Soporte por correo" className="grid size-[38px] place-items-center rounded-full bg-primary/12 text-primary transition-transform hover:-translate-y-0.5">
              <MailIcon className="size-[19px]" />
            </a>
          </div>
        </section>
      </div>
      {footer && <div className="absolute inset-x-0 bottom-0 z-[1]">{footer}</div>}

      <style>{`
        .auth-bg { background: radial-gradient(1200px 700px at 15% 10%, #e9e6ff 0, transparent 60%), radial-gradient(900px 600px at 90% 90%, #ffe3ee 0, transparent 55%), var(--background); }
        .dark .auth-bg { background: radial-gradient(1200px 700px at 15% 10%, rgba(123,118,255,.18) 0, transparent 60%), radial-gradient(900px 600px at 90% 90%, rgba(255,127,176,.12) 0, transparent 55%), var(--background); }
        .auth-card { box-shadow: 0 40px 90px rgba(34,26,84,.28), 0 8px 22px rgba(0,0,0,.08); animation: auth-cardin .7s cubic-bezier(.4,0,.2,1) both; }
        .auth-b1, .auth-b2, .auth-b3, .auth-sq { position: absolute; display: block; opacity: .7; }
        .auth-b1 { width: 420px; height: 420px; border-radius: 50%; left: -120px; top: -100px; background: radial-gradient(circle, rgba(102,85,229,.35), transparent 70%); animation: auth-fl1 14s ease-in-out infinite; }
        .auth-b2 { width: 360px; height: 360px; border-radius: 50%; right: -90px; bottom: -90px; background: radial-gradient(circle, rgba(255,118,94,.32), transparent 70%); animation: auth-fl2 12s ease-in-out infinite; }
        .auth-b3 { width: 260px; height: 260px; border-radius: 50%; right: 18%; top: -90px; background: radial-gradient(circle, rgba(15,157,154,.25), transparent 70%); animation: auth-fl1 16s ease-in-out infinite reverse; }
        .auth-sq { width: 54px; height: 54px; border-radius: 16px; border: 2px solid rgba(67,61,221,.25); }
        .auth-s1 { left: 8%; bottom: 14%; animation: auth-fl2 9s ease-in-out infinite; }
        .auth-s2 { right: 9%; top: 16%; border-radius: 50%; animation: auth-fl1 11s ease-in-out infinite; }
        .auth-s3 { left: 20%; top: 12%; width: 34px; height: 34px; animation: auth-fl2 13s ease-in-out infinite; }
        .auth-ablob { position: absolute; pointer-events: none; border-radius: 48% 52% 63% 37%; width: 20rem; aspect-ratio: 1; }
        .auth-a1 { top: -8rem; right: -6rem; border: 1px solid rgba(255,255,255,.24); box-shadow: 0 0 0 28px rgba(255,255,255,.06), 0 0 0 64px rgba(255,255,255,.04); animation: auth-fl1 12s ease-in-out infinite; }
        .auth-a2 { bottom: -10rem; left: -7rem; background: radial-gradient(circle, rgba(255,118,94,.3), rgba(174,151,255,.16) 40%, transparent 72%); animation: auth-fl2 10s ease-in-out infinite; }
        .auth-stage { animation: auth-fl2 8s ease-in-out infinite; }
        .auth-pulse { animation: auth-pulse 1.6s ease-in-out infinite; }
        .auth-grow { transform-origin: left; animation: auth-gx .9s cubic-bezier(.4,0,.2,1) both; }
        .auth-rise { transform-origin: bottom; animation: auth-gy .8s cubic-bezier(.4,0,.2,1) both; }
        @keyframes auth-cardin { from { opacity: 0; transform: translateY(24px) scale(.97); } }
        @keyframes auth-cardfl { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes auth-fl1 { 0%, 100% { transform: translate(0,0) rotate(0); } 50% { transform: translate(30px,24px) rotate(8deg); } }
        @keyframes auth-fl2 { 0%, 100% { transform: translate(0,0); } 50% { transform: translate(-26px,-30px) rotate(-8deg); } }
        @keyframes auth-pulse { 50% { transform: scale(1.08); } }
        @keyframes auth-gx { from { transform: scaleX(0); } }
        @keyframes auth-gy { from { transform: scaleY(0); } }
        @media (prefers-reduced-motion: reduce) { .auth-card, .auth-b1, .auth-b2, .auth-b3, .auth-sq, .auth-a1, .auth-a2, .auth-stage, .auth-pulse, .auth-grow, .auth-rise { animation: none !important; } }
      `}</style>
    </div>
  );
}
