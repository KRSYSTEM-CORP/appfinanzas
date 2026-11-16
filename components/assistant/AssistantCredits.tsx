"use client";

import { createContext, useContext, useState } from "react";
import { ZapIcon } from "lucide-react";

// Fuente única de los créditos del asistente en la página: encabezado, chat y pestaña Créditos
// leen de aquí. El chat la actualiza con cada consulta; si el servidor re-renderiza con otro
// valor (router.refresh), se vuelve a sincronizar.
type Ctx = { creditsLeft: number; setCreditsLeft: (n: number) => void };
const CreditsContext = createContext<Ctx | null>(null);

export function AssistantCreditsProvider({ initial, children }: { initial: number; children: React.ReactNode }) {
  const [creditsLeft, setCreditsLeft] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setCreditsLeft(initial);
  }
  return <CreditsContext.Provider value={{ creditsLeft, setCreditsLeft }}>{children}</CreditsContext.Provider>;
}

export function useAssistantCredits(): Ctx {
  const c = useContext(CreditsContext);
  if (!c) throw new Error("useAssistantCredits fuera de AssistantCreditsProvider");
  return c;
}

export function CreditsBadge() {
  const { creditsLeft } = useAssistantCredits();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3.5 py-2 text-sm text-primary" title="Créditos disponibles">
      <ZapIcon className="size-4" aria-hidden /> <b className="tabular-nums">{creditsLeft}</b> créditos
    </span>
  );
}
