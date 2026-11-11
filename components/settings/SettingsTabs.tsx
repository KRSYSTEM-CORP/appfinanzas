"use client";

import { useState } from "react";
import {
  BanknoteIcon,
  ChevronRightIcon,
  CrownIcon,
  DownloadIcon,
  FileTextIcon,
  KeyRoundIcon,
  LayoutGridIcon,
  PaletteIcon,
  PercentIcon,
  PrinterIcon,
  StoreIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";

export type SettingsSection = {
  id: string;
  label: string;
  // Línea corta bajo el título en la vista general (estado actual de la sección).
  hint?: string;
  content: React.ReactNode;
};

export type SetupStep = { label: string; hint: string; cta: string; sectionId: string; done: boolean };

const OVERVIEW = "__overview";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  plan: CrownIcon,
  equipo: UsersIcon,
  moneda: BanknoteIcon,
  apariencia: PaletteIcon,
  impresion: PrinterIcon,
  aplicacion: DownloadIcon,
  fiscales: FileTextIcon,
  iva: PercentIcon,
  cobros: WalletIcon,
  sucursales: StoreIcon,
  clave: KeyRoundIcon,
};

// Ajustes como en la preview v15: pestañas en píldora con ícono, guía paso a paso
// con progreso y una tarjeta por sección con su estado.
export function SettingsTabs({ sections, steps = [] }: { sections: SettingsSection[]; steps?: SetupStep[] }) {
  const [activeId, setActiveId] = useState<string>(OVERVIEW);
  const [stepIdx, setStepIdx] = useState(() => {
    const first = steps.findIndex((s) => !s.done);
    return first >= 0 ? first : 0;
  });
  const active = sections.find((s) => s.id === activeId);
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const step = steps[stepIdx];

  const pill = (on: boolean) =>
    `inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold whitespace-nowrap transition-colors ${
      on ? "bg-primary text-primary-foreground" : "bg-card text-foreground shadow-(--shadow-card) hover:bg-muted"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secciones de ajustes">
        <button type="button" role="tab" aria-selected={activeId === OVERVIEW} onClick={() => setActiveId(OVERVIEW)} className={pill(activeId === OVERVIEW)}>
          <LayoutGridIcon className="size-4" aria-hidden /> Todo en una vista
        </button>
        {sections.map((section) => {
          const Icon = ICONS[section.id];
          return (
            <button key={section.id} type="button" role="tab" aria-selected={section.id === activeId} onClick={() => setActiveId(section.id)} className={pill(section.id === activeId)}>
              {Icon && <Icon className="size-4" aria-hidden />} {section.label}
            </button>
          );
        })}
      </div>

      {active ? (
        <div className="max-w-5xl">{active.content}</div>
      ) : (
        <>
          {step && (
            <section className="flex flex-col gap-3 rounded-[22px] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_10%,var(--card)),var(--card))] p-5 shadow-(--shadow-card)">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="kr-eyebrow">Preparación para estar al 100 %</p>
                  <h2 className="text-xl font-bold tracking-tight">Guía paso a paso</h2>
                </div>
                <span className="text-4xl font-extrabold tracking-tight text-primary tabular-nums">{pct} %</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la configuración">
                <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">
                {done} de {steps.length} requisitos listos. Completa uno por uno para que tu negocio funcione a la perfección.
              </p>
              <div className="flex flex-col gap-2 rounded-2xl bg-card p-4">
                <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ${step.done ? "bg-success/14 text-success" : "bg-warning/18 text-warning"}`}>
                  {step.done ? "● Listo" : "● Pendiente"}
                </span>
                <h3 className="text-base font-bold">
                  Paso {stepIdx + 1} de {steps.length} · {step.label}
                </h3>
                <p className="text-sm text-muted-foreground">{step.hint}</p>
                <button type="button" onClick={() => setActiveId(step.sectionId)} className="mt-1 w-fit rounded-full bg-primary px-4 py-2.5 text-[13px] font-bold text-primary-foreground">
                  {step.cta} →
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <button type="button" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => Math.max(0, i - 1))} className="rounded-full bg-muted px-4 py-2 text-[13px] font-bold text-primary disabled:opacity-50">
                    ← Anterior
                  </button>
                  <button type="button" disabled={stepIdx === steps.length - 1} onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))} className="rounded-full bg-muted px-4 py-2 text-[13px] font-bold text-primary disabled:opacity-50">
                    Siguiente paso →
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {steps.map((s, i) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setStepIdx(i)}
                      aria-label={`Paso ${i + 1}: ${s.label}`}
                      aria-current={i === stepIdx}
                      className={`grid size-10 place-items-center rounded-full text-sm font-bold ${
                        i === stepIdx ? "bg-primary text-primary-foreground" : s.done ? "bg-success/14 text-success" : "bg-muted text-foreground"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
          <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => {
              const Icon = ICONS[section.id] ?? CrownIcon;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(section.id)}
                    className="flex w-full items-center gap-3.5 rounded-[19px] bg-card p-4 text-left shadow-(--shadow-card) transition-transform hover:-translate-y-0.5"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{section.label}</span>
                      {section.hint && <span className="block truncate text-[13px] text-muted-foreground">{section.hint}</span>}
                    </span>
                    <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
