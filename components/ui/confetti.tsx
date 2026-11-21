"use client";

import { useEffect, useRef } from "react";

// Confeti de celebración sin dependencias: un canvas a pantalla completa que no recibe clics y se retira
// solo. Usa los colores del tema (variables CSS) y no se muestra si la persona pidió menos movimiento.
const FALLBACK = ["#6c6bff", "#ff3da0", "#ffd23f", "#34c759", "#ff9f0a"];
const VARS = ["--primary", "--success", "--warning", "--destructive", "--accent-foreground"];

type Piece = { x: number; y: number; vx: number; vy: number; w: number; h: number; r: number; vr: number; c: string };

export function Confetti({ run, onDone, durationMs = 4200 }: { run: boolean; onDone?: () => void; durationMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!run) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      onDone?.();
      return;
    }
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const css = getComputedStyle(document.documentElement);
    const palette = VARS.map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
    const colors = palette.length >= 3 ? palette : FALLBACK;

    const pieces: Piece[] = Array.from({ length: 160 }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? -10 : W + 10,
        y: H * (0.55 + Math.random() * 0.25),
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 9),
        vy: -(9 + Math.random() * 11),
        w: 6 + Math.random() * 7,
        h: 4 + Math.random() * 6,
        r: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.4,
        c: colors[i % colors.length],
      };
    });

    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      const fade = t > durationMs - 900 ? Math.max(0, (durationMs - t) / 900) : 1;
      for (const p of pieces) {
        p.vy += 0.32;
        p.vx *= 0.992;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t < durationMs) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  if (!run) return null;
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[100] h-full w-full" />;
}
