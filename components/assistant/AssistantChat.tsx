"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MicIcon, SendIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyProposal, askAssistant, clearAssistantHistory, type AssistantStatus, type HistoryEntry } from "@/lib/actions/assistant";
import type { Proposal } from "@/lib/assistant";

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; proposal: Proposal | null; state?: "open" | "applied" | "dropped"; note?: string; entryId?: string | null };

const SUGGESTIONS = [
  "¿Cuánto vendí hoy?",
  "¿Qué productos tengo con stock bajo?",
  "¿Cuáles son mis productos más vendidos?",
  "¿Cuánto llevo gastado este mes?",
];

// Reconocimiento de voz del navegador (Chrome, Edge, Safari).
type SpeechRec = {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function describe(p: Proposal): string {
  return p.type === "EXPENSE"
    ? `Registrar gasto: ${p.description} · ${p.amount}${p.category ? ` · ${p.category}` : ""}`
    : `Ajustar precios de «${p.category}»: ${p.percent > 0 ? "+" : ""}${p.percent} %`;
}

function fromHistory(history: HistoryEntry[]): Msg[] {
  return history.flatMap<Msg>((h) => [
    { role: "user", text: h.question },
    {
      role: "assistant",
      text: h.answer,
      proposal: h.proposal,
      state: h.applied ? "applied" : "open",
      note: h.applied ? "Cambio aplicado." : undefined,
      entryId: h.id,
    },
  ]);
}

export function AssistantChat({ status, applyCost, history = [] }: { status: AssistantStatus; applyCost: number; history?: HistoryEntry[] }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(() => fromHistory(history));
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [creditsLeft, setCreditsLeft] = useState(status.creditsLeft);
  const [asked, setAsked] = useState(status.askedToday);
  const [isPending, startTransition] = useTransition();
  const recRef = useRef<SpeechRec | null>(null);

  function send(q: string) {
    const question = q.trim();
    if (!question || isPending) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setText("");
    startTransition(async () => {
      const r = await askAssistant(question);
      if (r.success) {
        setAsked((n) => n + 1);
        setMsgs((m) => [...m, { role: "assistant", text: r.reply.answer, proposal: r.reply.proposal, state: "open", entryId: r.entryId }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", text: r.error, proposal: null }]);
      }
    });
  }

  function apply(index: number, p: Proposal, entryId?: string | null) {
    startTransition(async () => {
      const r = await applyProposal(p, entryId);
      setMsgs((m) =>
        m.map((x, i) =>
          i === index && x.role === "assistant"
            ? { ...x, state: r.success ? "applied" : "open", note: r.success ? r.summary : r.error }
            : x
        )
      );
      if (r.success) {
        setCreditsLeft((c) => Math.max(0, c - applyCost));
        router.refresh();
      }
    });
  }

  function clearHistory() {
    startTransition(async () => {
      await clearAssistantHistory();
      setMsgs([]);
    });
  }

  function toggleMic() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Rec = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Rec) {
      setMsgs((m) => [...m, { role: "assistant", text: "Tu navegador no permite dictado por voz. Usa Chrome, Edge o Safari.", proposal: null }]);
      return;
    }
    const rec = new Rec();
    rec.lang = "es-VE";
    rec.interimResults = false;
    rec.onresult = (e) => {
      const t = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      setText((prev) => `${prev} ${t}`.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  if (!status.configured) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        El asistente todavía no está activado en esta plataforma. Avisa al administrador de KR System.
      </p>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card p-2.5 text-sm">
        <span>
          Créditos: <b className="tabular-nums">{creditsLeft}</b>
        </span>
        <span className="text-muted-foreground">
          Consultas hoy: {asked} de {status.askCap}
        </span>
        {msgs.length > 0 && (
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={clearHistory} disabled={isPending}>
            Borrar historial
          </Button>
        )}
      </div>

      <div className="flex min-h-64 flex-col gap-2 rounded-lg border bg-card p-3" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Prueba con una de estas preguntas, o dicta con el micrófono:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} size="sm" variant="outline" onClick={() => send(s)} disabled={isPending}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="self-end rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground">
                {m.text}
              </div>
            ) : (
              <div key={i} className="flex max-w-[92%] flex-col gap-2 self-start rounded-2xl bg-muted px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.proposal && m.state !== "dropped" && (
                  <div className="flex flex-col gap-2 rounded-lg border bg-background p-2.5">
                    <p className="font-medium">{describe(m.proposal)}</p>
                    {m.state === "applied" ? (
                      <p className="text-success">{m.note}</p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Ver la propuesta es gratis. Solo se cobra si confirmas: {applyCost} créditos.
                        </p>
                        {m.note && <p className="text-xs text-destructive">{m.note}</p>}
                        <div className="flex gap-2">
                          <Button size="sm" disabled={isPending || creditsLeft < applyCost} onClick={() => apply(i, m.proposal as Proposal, m.entryId)}>
                            Aplicar · {applyCost} créditos
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMsgs((all) => all.map((x, j) => (j === i && x.role === "assistant" ? { ...x, state: "dropped" } : x)))}
                          >
                            Descartar
                          </Button>
                        </div>
                        {creditsLeft < applyCost && <p className="text-xs text-destructive">No tienes créditos suficientes.</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          )
        )}
        {isPending && <p className="self-start text-sm text-muted-foreground">Pensando…</p>}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <Input aria-label="Pregunta al asistente" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe o dicta tu pregunta…" maxLength={600} />
        <Button type="button" variant={listening ? "destructive" : "outline"} size="icon" onClick={toggleMic} aria-label={listening ? "Detener dictado" : "Dictar por voz"}>
          {listening ? <SquareIcon className="size-4" /> : <MicIcon className="size-4" />}
        </Button>
        <Button type="submit" size="icon" disabled={isPending || text.trim().length < 2} aria-label="Enviar">
          <SendIcon className="size-4" />
        </Button>
      </form>
    </div>
  );
}
