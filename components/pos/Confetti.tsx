"use client";

import { useEffect, useRef } from "react";

// Confeti de celebración al completar una venta: un lienzo propio (sin
// dependencias) encima de todo, que no recibe clics y desaparece solo en ~2,4 s.
// Con «reducir movimiento» activado no se dibuja nada.
export function Confetti({ burstKey }: { burstKey: string | number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const css = getComputedStyle(document.documentElement);
    const colors = ["--primary", "--m-caja", "--chart-3", "--chart-4", "--chart-2", "--m-pre"]
      .map((v) => css.getPropertyValue(v).trim())
      .filter(Boolean);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    type P = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; round: boolean };
    const parts: P[] = [];
    const spawn = (x: number, dir: number) => {
      for (let i = 0; i < 70; i++) {
        const angle = (-Math.PI / 2) + dir * (0.25 + Math.random() * 0.55);
        const speed = 9 + Math.random() * 9;
        parts.push({
          x,
          y: H * 0.72,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.35,
          w: 6 + Math.random() * 6,
          h: 4 + Math.random() * 6,
          c: colors[i % colors.length] || "currentColor",
          round: Math.random() < 0.25,
        });
      }
    };
    spawn(W * 0.18, 1);
    spawn(W * 0.82, -1);

    const start = performance.now();
    const DURATION = 2400;
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      const fade = t > DURATION - 600 ? Math.max(0, (DURATION - t) / 600) : 1;
      ctx.globalAlpha = fade;
      for (const p of parts) {
        p.vy += 0.32;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.h / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
        }
        ctx.restore();
      }
      if (t < DURATION) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [burstKey]);

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] size-full" />;
}
