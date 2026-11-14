"use client";

import { useState, useTransition } from "react";
import { Switch } from "@/components/settings/SettingsUi";
import { setWeeklyReportEnabled } from "@/lib/actions/reports";

// Activa o desactiva el correo semanal (domingo por la noche) a los gerentes.
export function WeeklyReportToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <div className="flex w-fit items-center gap-3 text-sm">
      <Switch
        on={on}
        disabled={pending}
        label="Recibir el reporte semanal por correo"
        onChange={(next) => {
          setOn(next);
          start(async () => {
            const r = await setWeeklyReportEnabled(next);
            if (!r.success) setOn(!next);
          });
        }}
      />
      <span>Recibir este reporte por correo cada domingo por la noche</span>
    </div>
  );
}
