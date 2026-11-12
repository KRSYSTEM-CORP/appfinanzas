"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import type { HistoryEntry } from "@/lib/actions/assistant";

type Tab = "chat" | "credits" | "history";

// Pestañas del Asistente: el chat se mantiene montado (no pierde la conversación al cambiar de pestaña).
export function AssistantTabs({
  chat,
  credits,
  history,
}: {
  chat: React.ReactNode;
  credits: React.ReactNode;
  history: HistoryEntry[];
}) {
  const [tab, setTab] = useState<Tab>("chat");
  return (
    <div className="flex flex-col gap-4">
      <Segmented
        label="Secciones del asistente"
        value={tab}
        onChange={setTab}
        options={[
          { value: "chat", label: "Asistente" },
          { value: "credits", label: "Créditos" },
          { value: "history", label: "Historial" },
        ]}
      />
      <div hidden={tab !== "chat"}>{chat}</div>
      {tab === "credits" && <div>{credits}</div>}
      {tab === "history" && (
        <div className="flex flex-col gap-2">
          {history.length === 0 ? (
            <p className="rounded-[19px] bg-card p-4 text-sm text-muted-foreground shadow-(--shadow-card)">Aún no has hecho preguntas.</p>
          ) : (
            [...history].reverse().map((h) => (
              <article key={h.id} className="flex flex-col gap-1.5 rounded-[19px] bg-card p-4 text-sm shadow-(--shadow-card)">
                <p className="font-bold">{h.question}</p>
                <p className="whitespace-pre-line text-muted-foreground">{h.answer}</p>
                {h.proposal && (
                  <span className="w-fit rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold">
                    {h.applied ? (h.undone ? "Propuesta aplicada y deshecha" : "Propuesta aplicada") : "Propuesta sin aplicar"}
                  </span>
                )}
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
