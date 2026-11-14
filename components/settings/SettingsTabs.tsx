"use client";

import { useState } from "react";
import { IconTile } from "@/components/ui/icon-tile";
import {
  BanknoteIcon,
  ChevronRightIcon,
  CrownIcon,
  DownloadIcon,
  FileTextIcon,
  KeyRoundIcon,
  SettingsIcon,
  ShieldCheckIcon,
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
  // Sin tarjeta ni título propios: el contenido ya trae sus tarjetas (Equipo, Impresión).
  bare?: boolean;
  content: React.ReactNode;
};

export type SetupStep = { label: string; hint: string; cta: string; sectionId: string; done: boolean };

const OVERVIEW = "__overview";

// Las secciones se agrupan en los seis bloques de la preview.
const GROUPS: { id: string; label: string; icon: string; sections: string[] }[] = [
  { id: "g-plan", label: "Mi Plan", icon: "plan", sections: ["plan"] },
  { id: "g-marca", label: "Marca", icon: "apariencia", sections: ["apariencia"] },
  { id: "g-negocio", label: "Negocio", icon: "sucursales", sections: ["fiscales", "iva", "sucursales"] },
  { id: "g-pagos", label: "Pagos y Moneda", icon: "moneda", sections: ["moneda", "cobros"] },
  { id: "g-equipo", label: "Equipo y Seguridad", icon: "seguridad", sections: ["equipo", "clave"] },
  { id: "g-imp", label: "Impresión y Datos", icon: "impresion", sections: ["impresion", "aplicacion"] },
];

// Orden de las tarjetas de la vista general (la preview deja Mi Plan al final).
const CARD_ORDER = ["g-marca", "g-negocio", "g-pagos", "g-equipo", "g-imp", "g-plan"];

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  plan: CrownIcon,
  equipo: UsersIcon,
  seguridad: ShieldCheckIcon,
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
  const groups = GROUPS.map((g) => ({ ...g, items: sections.filter((s) => g.sections.includes(s.id)) })).filter((g) => g.items.length > 0);
  const groupOf = (sectionId: string) => groups.find((g) => g.sections.includes(sectionId))?.id ?? sectionId;
  const active = groups.find((g) => g.id === activeId);
  const done = steps.filter((s) => s.done).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  const step = steps[stepIdx];

  const pill = (on: boolean) =>
    `inline-flex min-h-11 flex-none items-center gap-2 rounded-full px-4 text-sm font-bold whitespace-nowrap shadow-(--shadow-card) transition duration-150 active:scale-[0.97] ${
      on ? "bg-primary text-primary-foreground" : "bg-card text-foreground"
    }`;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-2 p-0.5" role="tablist" aria-label="Secciones de ajustes">
        <button type="button" role="tab" aria-selected={activeId === OVERVIEW} onClick={() => setActiveId(OVERVIEW)} className={pill(activeId === OVERVIEW)}>
          <SettingsIcon className="size-[18px]" aria-hidden /> Todo en una vista
        </button>
        {groups.map((g) => {
          const Icon = ICONS[g.icon];
          return (
            <button key={g.id} type="button" role="tab" aria-selected={g.id === activeId} onClick={() => setActiveId(g.id)} className={pill(g.id === activeId)}>
              {Icon && <Icon className="size-[18px]" aria-hidden />} {g.label}
            </button>
          );
        })}
      </div>

      {active ? (
        <div className="flex flex-col gap-3.5">
          {active.items.map((section) =>
            section.bare ? (
              <div key={section.id} className="min-w-0">
                {section.content}
              </div>
            ) : (
            <section key={section.id} aria-label={section.label} className="relative min-w-0 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
              <h2 className="mb-3 text-base font-bold">{section.label}</h2>
              {section.content}
            </section>
            )
          )}
        </div>
      ) : (
        <>
          {step && (
            <section className="relative rounded-[19px] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_14%,var(--card)),var(--card))] p-4 shadow-(--shadow-card)">
              <div className="flex items-start justify-between gap-2.5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Preparación para estar al 100 %</p>
                  <h2 className="text-xl font-bold">Guía paso a paso</h2>
                </div>
                <b className="text-[34px] tracking-[-0.04em] text-primary tabular-nums">{pct} %</b>
              </div>
              <div className="my-2.5 h-2 min-w-[60px] overflow-hidden rounded-full bg-[var(--track)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la configuración">
                <div className="h-full rounded-full bg-[var(--ok-solid)] transition-[width] duration-300" style={{ width: `${pct}%` }} />
              </div>
              <p className="mb-3 text-muted-foreground">
                {done} de {steps.length} requisitos listos. Completa uno por uno para que tu negocio funcione a la perfección.
              </p>
              <div className="rounded-2xl bg-card p-3.5 shadow-(--shadow-card)">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-bold ${step.done ? "bg-success/14 text-success" : "bg-warning/18 text-warning"}`}>
                  <i className="size-[7px] rounded-full bg-current" />
                  {step.done ? "Listo" : "Pendiente"}
                </span>
                <b className="mt-1.5 block text-base">
                  Paso {stepIdx + 1} de {steps.length} · {step.label}
                </b>
                <p className="mb-3 mt-1 text-muted-foreground">{step.hint}</p>
                <button type="button" onClick={() => setActiveId(groupOf(step.sectionId))} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-transform active:scale-[0.97]">
                  {step.cta} →
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={stepIdx === 0} onClick={() => setStepIdx((i) => Math.max(0, i - 1))} className="inline-flex min-h-10 items-center rounded-full bg-muted px-3.5 text-[13px] font-semibold text-primary transition-transform active:scale-[0.97] disabled:opacity-50">
                    ← Anterior
                  </button>
                  <button type="button" disabled={stepIdx === steps.length - 1} onClick={() => setStepIdx((i) => Math.min(steps.length - 1, i + 1))} className="inline-flex min-h-10 items-center rounded-full bg-muted px-3.5 text-[13px] font-semibold text-primary transition-transform active:scale-[0.97] disabled:opacity-50">
                    Siguiente paso →
                  </button>
                </div>
                <div className="flex gap-1.5" role="group" aria-label="Pasos">
                  {steps.map((s, i) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => setStepIdx(i)}
                      aria-label={`Paso ${i + 1}: ${s.label}`}
                      aria-pressed={i === stepIdx}
                      className={`size-[38px] rounded-full border-2 font-extrabold ${
                        i === stepIdx ? "border-primary bg-primary text-primary-foreground" : s.done ? "border-transparent bg-success/14 text-success" : "border-transparent bg-muted"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
          <ul className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))" }}>
            {CARD_ORDER.map((id) => groups.find((x) => x.id === id)).filter((g): g is (typeof groups)[number] => !!g).map((g) => {
              const Icon = ICONS[g.icon] ?? CrownIcon;
              const hint = g.items.map((i) => i.hint).filter(Boolean).join(" · ");
              return (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(g.id)}
                    className="flex h-full w-full items-center gap-3 rounded-[19px] border-2 border-transparent bg-card p-4 text-left shadow-(--shadow-card) transition duration-150 hover:-translate-y-0.5 hover:border-primary"
                  >
                    <IconTile>
                      <Icon className="size-[22px]" aria-hidden />
                    </IconTile>
                    <span className="min-w-0 flex-1">
                      <b className="block text-base">{g.label}</b>
                      {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
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
