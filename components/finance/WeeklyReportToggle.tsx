"use client";

import { useState, useTransition } from "react";
import { setWeeklyReportEnabled } from "@/lib/actions/reports";

// Activa o desactiva el correo semanal (domingo por la noche) a los gerentes.
export function WeeklyReportToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <label className="flex w-fit cursor-pointer items-center gap-3 text-sm">
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(async () => {
            const r = await setWeeklyReportEnabled(next);
            if (!r.success) setOn(!next);
          });
        }}
        className="size-4 accent-[var(--primary)]"
      />
      <span>Recibir este reporte por correo cada domingo por la noche</span>
    </label>
  );
}
