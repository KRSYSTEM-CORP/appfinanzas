"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, BarChart3Icon, MicIcon, PackageIcon, SendIcon, SparklesIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyProposal, askAssistant, clearAssistantHistory, undoProposal, type AssistantStatus, type HistoryEntry } from "@/lib/actions/assistant";
import type { Proposal } from "@/lib/assistant";

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; proposal: Proposal | null; state?: "open" | "applied" | "dropped" | "undone"; canUndo?: boolean; note?: string; entryId?: string | null };

const SUGGESTIONS = [
  { title: "¿Cuánto vendí hoy?", desc: "Resumen de ventas del día, en palabras simples.", prompt: "¿Cuánto vendí hoy?", Icon: BarChart3Icon },
  { title: "Productos con stock bajo", desc: "Qué se está acabando y conviene reponer.", prompt: "¿Qué productos tengo con stock bajo?", Icon: PackageIcon },
  { title: "Los más vendidos", desc: "Tus productos estrella del período.", prompt: "¿Cuáles son mis productos más vendidos?", Icon: SparklesIcon },
  { title: "Gastos del mes", desc: "Cuánto llevas gastado y en qué.", prompt: "¿Cuánto llevo gastado este mes?", Icon: BanknoteIcon },
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
      state: h.undone ? "undone" : h.applied ? "applied" : "open",
      canUndo: h.canUndo,
      note: h.undone ? "Cambio deshecho." : h.applied ? "Cambio aplicado." : undefined,
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
            ? { ...x, state: r.success ? "applied" : "open", canUndo: r.success && !!entryId, note: r.success ? r.summary : r.error }
            : x
        )
      );
      if (r.success) {
        setCreditsLeft((c) => Math.max(0, c - applyCost));
        router.refresh();
      }
    });
  }

  function undo(index: number, entryId: string) {
    startTransition(async () => {
      const r = await undoProposal(entryId);
      setMsgs((m) =>
        m.map((x, i) =>
          i === index && x.role === "assistant"
            ? { ...x, state: r.success ? "undone" : x.state, canUndo: r.success ? false : x.canUndo, note: r.success ? r.summary : r.error }
            : x
        )
      );
      if (r.success) router.refresh();
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl bg-card p-3 text-sm shadow-(--shadow-card)">
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

      <div className="flex min-h-64 flex-col gap-2 rounded-[22px] bg-card p-4 shadow-(--shadow-card)" aria-live="polite">
        {msgs.length === 0 ? (
          <div className="flex flex-col items-center gap-5 py-4">
            <span className="grid size-16 place-items-center rounded-full bg-[conic-gradient(from_200deg,#433ddd,#0f9d9a,#ff9f0a,#433ddd)] text-white shadow-[0_0_30px_rgba(67,61,221,.35)]" aria-hidden>
              <SparklesIcon className="size-7" />
            </span>
            <div className="text-center">
              <h2 className="text-2xl font-extrabold tracking-tight">¿Qué hacemos hoy por tu negocio?</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Primero te muestro los cambios y su costo en créditos, gratis. Tú decides si continuar.
              </p>
            </div>
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  disabled={isPending}
                  onClick={() => send(s.prompt)}
                  className="flex flex-col items-start gap-1.5 rounded-[19px] bg-muted p-4 text-left transition-colors hover:bg-muted/70 disabled:opacity-60"
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-primary/12 text-primary">
                    <s.Icon className="size-[18px]" />
                  </span>
                  <span className="font-bold">{s.title}</span>
                  <span className="text-[13px] text-muted-foreground">{s.desc}</span>
                </button>
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
                    {m.state === "undone" ? (
                      <p className="text-muted-foreground">{m.note}</p>
                    ) : m.state === "applied" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-success">{m.note}</p>
                        {m.canUndo && m.entryId && (
                          <Button size="sm" variant="outline" disabled={isPending} onClick={() => undo(i, m.entryId as string)}>
                            Deshacer · gratis 24 h
                          </Button>
                        )}
                      </div>
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
