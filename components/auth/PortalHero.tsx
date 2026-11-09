"use client";

import { useEffect, useState } from "react";

// Mitad informativa de la tarjeta de acceso (preview v15): degradado morado,
// «Todo tu negocio. Más claro.» y cuatro mockups que rotan (POS, Inventario,
// Ganancia, Presupuestos). Es decorativa: no usa datos reales. En teléfono se
// reduce a una franja con la marca y el lema.
const SLIDES = ["pos", "inventario", "ganancia", "presupuestos"] as const;

function Mockup({ kind }: { kind: (typeof SLIDES)[number] }) {
  const box = "flex h-full flex-col gap-2.5 rounded-[20px] border border-white/20 bg-white/10 p-3.5 shadow-[0_24px_50px_rgba(0,0,0,0.22)] backdrop-blur-sm";
  const head = (t: string, s: string) => (
    <div className="flex items-center justify-between text-xs">
      <b className="text-[13px]">{t}</b>
      <span className="rounded-full bg-white/20 px-2.5 py-0.5 font-semibold">{s}</span>
    </div>
  );
  if (kind === "pos")
    return (
      <div className={box}>
        {head("POS", "Caja abierta")}
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={`h-[34px] rounded-[10px] ${i === 2 ? "auth-pulse bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.3)]" : "bg-white/20"}`} />
          ))}
        </div>
        <div className="flex flex-col gap-1.5 rounded-[14px] bg-white/[0.12] p-2.5 text-xs">
          <div className="flex justify-between"><span>2 × Zapatos 42</span><b>$118,00</b></div>
          <div className="flex justify-between"><span>1 × Perfume</span><b>$42,00</b></div>
          <div className="flex justify-between border-t border-dashed border-white/30 pt-1.5 text-sm font-extrabold"><span>Total</span><b>$160,00</b></div>
          <div className="mt-0.5 rounded-full bg-white py-1.5 text-center font-extrabold text-[#2a1f7a]">Cobrar</div>
        </div>
      </div>
    );
  if (kind === "inventario")
    return (
      <div className={box}>
        {head("Inventario", "2 alertas")}
        {[
          ["Camisa M", 80, "#34c759", "Disponible", "bg-[#7be08f]"],
          ["Zapatos 41", 22, "#ff9f0a", "Stock bajo", "bg-[#ffc15c]"],
          ["Labial mate", 4, "#ff3b30", "Agotado", "bg-[#ff8a80]"],
        ].map(([n, w, c, l, bg]) => (
          <div key={n as string} className="grid grid-cols-[78px_1fr_auto] items-center gap-2 text-xs">
            <span>{n}</span>
            <div className="h-2 overflow-hidden rounded-full bg-white/20">
              <i className="auth-grow block h-full rounded-full" style={{ width: `${w}%`, background: c as string }} />
            </div>
            <em className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold not-italic text-[#06210f] ${bg}`}>{l}</em>
          </div>
        ))}
      </div>
    );
  if (kind === "ganancia")
    return (
      <div className={box}>
        {head("Ganancia neta estimada", "Noviembre")}
        <div className="text-[34px] font-extrabold tracking-tight text-[#8af0a6]">$1.120,00</div>
        <div className="flex min-h-[60px] flex-1 items-end gap-1.5">
          {[40, 62, 50, 78, 66, 92, 74].map((h, i) => (
            <i key={i} className="auth-rise flex-1 rounded-t-md rounded-b-sm bg-white/35" style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>
      </div>
    );
  return (
    <div className={box}>
      {head("Presupuestos", "78 % de cierre")}
      <div className="flex flex-col gap-1.5 text-xs font-bold">
        {[
          ["Creados · 8", 100, ""],
          ["Enviados · 7", 82, ""],
          ["Vistos · 5", 62, ""],
          ["Convertidos · 3", 38, "!bg-[#34c759]"],
        ].map(([t, w, extra]) => (
          <div key={t as string} className={`auth-grow rounded-[10px] bg-white/[0.22] px-2.5 py-2 ${extra}`} style={{ width: `${w}%` }}>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PortalHero() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((i) => (i + 1) % SLIDES.length), 3800);
    return () => clearInterval(t);
  }, []);

  return (
    <section
      aria-label="Qué es KR POS"
      className="relative flex flex-col gap-4 overflow-hidden p-5 text-white lg:gap-[18px] lg:p-8"
      style={{ background: "linear-gradient(140deg, #211a54 0%, #4435bd 56%, #6655e5 100%)" }}
    >
      <div className="auth-ablob auth-a1" aria-hidden />
      <div className="auth-ablob auth-a2" aria-hidden />
      <div className="relative z-[1] text-xl font-extrabold tracking-tight">KR POS</div>
      <div className="relative z-[1]">
        <h2 className="text-balance text-2xl font-bold leading-[1.1] tracking-tight lg:text-[30px]">Todo tu negocio. Más claro.</h2>
        <p className="mt-2 hidden text-sm text-white/70 lg:block">Ventas, inventario y ganancia en un solo lugar.</p>
      </div>
      <div className="auth-stage relative z-[1] hidden min-h-[230px] flex-1 lg:block" aria-hidden>
        {SLIDES.map((k, i) => (
          <div
            key={k}
            className="absolute inset-0 transition-[opacity,transform] duration-500 ease-out"
            style={{ opacity: i === active ? 1 : 0, transform: i === active ? "none" : "translateY(16px) scale(.97)", pointerEvents: "none" }}
          >
            {i === active && <Mockup kind={k} />}
          </div>
        ))}
      </div>
      <div className="relative z-[1] hidden gap-1.5 lg:flex" aria-hidden>
        {SLIDES.map((k, i) => (
          <i key={k} className={`h-[7px] rounded-full transition-[width,background-color] duration-300 ${i === active ? "w-[22px] bg-white" : "w-[7px] bg-white/35"}`} />
        ))}
      </div>
    </section>
  );
}
