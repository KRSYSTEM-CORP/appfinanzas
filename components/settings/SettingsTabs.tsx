"use client";

import { useState } from "react";
import { ChevronRightIcon, LayoutGridIcon } from "lucide-react";

export type SettingsSection = {
  id: string;
  label: string;
  content: React.ReactNode;
};

const OVERVIEW = "__overview";

// Ajustes como en la preview v15: pestañas en píldora y una vista general con
// una tarjeta por sección.
export function SettingsTabs({ sections }: { sections: SettingsSection[] }) {
  const [activeId, setActiveId] = useState<string>(OVERVIEW);
  const active = sections.find((s) => s.id === activeId);

  const pill = (on: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
      on ? "bg-primary text-primary-foreground" : "bg-card text-foreground shadow-(--shadow-card) hover:bg-muted"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Secciones de ajustes">
        <button type="button" role="tab" aria-selected={activeId === OVERVIEW} onClick={() => setActiveId(OVERVIEW)} className={pill(activeId === OVERVIEW)}>
          <LayoutGridIcon className="size-4" aria-hidden /> Todo en una vista
        </button>
        {sections.map((section) => (
          <button key={section.id} type="button" role="tab" aria-selected={section.id === activeId} onClick={() => setActiveId(section.id)} className={pill(section.id === activeId)}>
            {section.label}
          </button>
        ))}
      </div>

      {active ? (
        <div className="max-w-5xl">{active.content}</div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => setActiveId(section.id)}
                className="flex w-full items-center justify-between gap-3 rounded-[20px] bg-card p-5 text-left shadow-(--shadow-card) transition-transform hover:-translate-y-0.5"
              >
                <span className="font-bold">{section.label}</span>
                <ChevronRightIcon className="size-5 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
