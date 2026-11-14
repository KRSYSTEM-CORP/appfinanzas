"use client";

import { useState } from "react";
import { MegaphoneIcon, XIcon } from "lucide-react";
import { TONE_BG, TONE_TEXT, type Tone } from "@/components/shared/Kpi";
import { cn } from "@/lib/utils";

const KEY = "kr-pos-announcements-dismissed";

function readDismissed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

// Avisos de KR System para esta empresa (Plataforma → Anuncios en la app). Se pueden cerrar por sesión.
export function AnnouncementBanners({ items }: { items: { id: string; title: string; body: string; tone: string }[] }) {
  const [hidden, setHidden] = useState<string[]>(readDismissed);
  const visible = items.filter((i) => !hidden.includes(i.id));
  if (visible.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-4">
      {visible.map((i) => {
        const tone = (["info", "ok", "warn", "bad"].includes(i.tone) ? i.tone : "info") as Tone;
        return (
          <div key={i.id} role="status" className="flex items-start gap-3 rounded-[19px] bg-card p-3.5 text-sm shadow-(--shadow-card)">
            <span aria-hidden className={cn("grid size-[34px] flex-none place-items-center rounded-full", TONE_BG[tone], TONE_TEXT[tone])}>
              <MegaphoneIcon className="size-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block">{i.title}</b>
              <p className="text-[13px] text-muted-foreground">{i.body}</p>
            </div>
            <button
              type="button"
              aria-label="Cerrar aviso"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => {
                const next = [...hidden, i.id];
                setHidden(next);
                try {
                  sessionStorage.setItem(KEY, JSON.stringify(next));
                } catch {
                  // sin almacenamiento: el aviso solo se oculta en esta vista
                }
              }}
            >
              <XIcon className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
