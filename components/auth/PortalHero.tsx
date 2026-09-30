import { LayoutGridIcon, PackageIcon, ReceiptTextIcon, ShoppingCartIcon } from "lucide-react";

// The marketing-facing right panel of the split login ("01 · Portal"
// direction) — KR POS's own brand violet, independent of a visiting
// company's chosen accent (that only lives in the form column via
// LoginForm's live branding preview). Purely decorative: no real data, no
// business copy beyond what already exists elsewhere (WelcomeModal), so
// nothing here can drift out of sync with an actual capability or price.
export function PortalHero() {
  return (
    <div className="portal-hero relative hidden lg:flex flex-col justify-between overflow-hidden p-10 text-white">
      <div className="portal-hero-blob-a" />
      <div className="portal-hero-blob-b" />

      <div className="relative flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="size-7 rounded-md" />
        <span className="font-semibold tracking-tight">KR POS</span>
      </div>

      <div className="relative flex flex-col gap-4 max-w-md">
        <h2 className="text-4xl font-semibold leading-tight text-balance">
          Todo tu negocio. Más claro.
        </h2>
        <p className="text-white/70 text-sm leading-relaxed">
          Punto de venta, inventario y reportes en un solo sistema — pensado para pymes que
          necesitan control real de su negocio, todos los días.
        </p>
      </div>

      <div className="portal-product-preview relative rounded-2xl border border-white/15 bg-white/[0.07] p-4 shadow-2xl shadow-black/20 backdrop-blur-sm max-w-md">
        <div className="flex items-center gap-2 text-xs text-white/60 mb-3">
          <ShoppingCartIcon className="size-3.5" />
          Punto de venta
        </div>
        <div className="flex items-end gap-1.5 h-16 mb-4">
          {[40, 65, 50, 80, 60, 90, 70].map((h, i) => (
            <div
              key={i}
              className="flex-1 rounded-t bg-white/25 first:bg-white/20"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-lg bg-white/[0.06] border border-white/10 p-2.5 flex flex-col gap-1.5">
            <PackageIcon className="size-3.5 text-white/60" />
            <span className="text-[11px] text-white/60">Inventario</span>
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full w-2/3 rounded-full bg-white/40" />
            </div>
          </div>
          <div className="rounded-lg bg-white/[0.06] border border-white/10 p-2.5 flex flex-col gap-1.5">
            <ReceiptTextIcon className="size-3.5 text-white/60" />
            <span className="text-[11px] text-white/60">Reportes</span>
            <div className="h-1.5 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full w-4/5 rounded-full bg-white/40" />
            </div>
          </div>
        </div>
        <div className="absolute -right-3 -top-3 flex items-center gap-1.5 rounded-full bg-white text-[#24145e] px-2.5 py-1 text-[11px] font-medium shadow-lg">
          <LayoutGridIcon className="size-3" />
          Todo en un lugar
        </div>
      </div>

      <style>{`
        .portal-hero {
          background: linear-gradient(140deg, #24145e, #4528bd 58%, #6b4bf0);
        }
        .portal-hero-blob-a,
        .portal-hero-blob-b {
          position: absolute;
          z-index: 0;
          width: 22rem;
          aspect-ratio: 1;
          border-radius: 48% 52% 63% 37%;
          pointer-events: none;
        }
        .portal-hero-blob-a {
          top: -8rem;
          right: -5rem;
          border: 1px solid rgb(255 255 255 / 24%);
          box-shadow: 0 0 0 30px rgb(255 255 255 / 6%), 0 0 0 70px rgb(255 255 255 / 4%);
          animation: portal-drift 12s ease-in-out infinite;
        }
        .portal-hero-blob-b {
          bottom: -12rem;
          left: -8rem;
          background: radial-gradient(circle, rgb(174 151 255 / 40%), transparent 70%);
          filter: blur(8px);
          animation: portal-glow 10s ease-in-out infinite alternate;
        }
        .portal-product-preview {
          animation: portal-float 7s ease-in-out infinite;
        }
        @keyframes portal-drift {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          50%      { transform: translate3d(12px, -14px, 0) rotate(3deg); }
        }
        @keyframes portal-glow {
          from { transform: scale(.92); opacity: .55; }
          to   { transform: scale(1.08); opacity: .9; }
        }
        @keyframes portal-float {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-7px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .portal-hero-blob-a,
          .portal-hero-blob-b,
          .portal-product-preview {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
