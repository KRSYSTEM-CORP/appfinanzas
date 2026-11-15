"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteIcon, BarChart3Icon, CheckIcon, FileTextIcon, MicIcon, PackageIcon, SendIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyProposal, askAssistant, undoProposal, type AssistantStatus, type HistoryEntry } from "@/lib/actions/assistant";
import { AI_ASK_COST, AI_BIG_COST, MAX_CONVERSATION_MESSAGES, MAX_QUESTION_CHARS, type Proposal } from "@/lib/assistant";
import type { ResolvedBlock, SalePreview } from "@/lib/assistant-types";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import { AssistantBlocks, SalePreviewCard } from "@/components/assistant/AssistantBlocks";

type Msg =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; proposal: Proposal | null; state?: "open" | "applied" | "dropped" | "undone"; canUndo?: boolean; note?: string; entryId?: string | null; cost?: number; blocks?: ResolvedBlock[]; salePreview?: SalePreview | null; saleOk?: boolean };

const SUGGESTIONS = [
  { title: "¿Cuánto vendí este mes?", desc: "Con gráfica por día y el total del período.", prompt: "Muéstrame una gráfica de mis ventas por día de este mes y cuánto he vendido en total.", Icon: BarChart3Icon },
  { title: "Productos con stock bajo", desc: "Qué se acaba y conviene reponer, con PDF.", prompt: "¿Qué productos tengo con stock bajo? Muéstramelo en una tabla que pueda descargar en PDF.", Icon: PackageIcon },
  { title: "Reporte en PDF", desc: "Cuentas por cobrar listas para descargar.", prompt: "Genérame un PDF con mis cuentas por cobrar.", Icon: FileTextIcon },
  { title: "Gastos del mes", desc: "En qué se va tu dinero, por categoría.", prompt: "¿Cuánto llevo gastado este mes y en qué categorías? Muéstrame una gráfica.", Icon: BanknoteIcon },
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
  if (p.type === "EXPENSE") return `Registrar gasto: ${p.description} · ${p.amount}${p.category ? ` · ${p.category}` : ""}`;
  if (p.type === "SALE") return `Registrar una venta de ${p.items.reduce((n, i) => n + i.quantity, 0)} artículo(s)${p.paymentStatus === "CREDIT" ? " a crédito" : ""}`;
  return `Ajustar precios de «${p.category}»: ${p.percent > 0 ? "+" : ""}${p.percent} %`;
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

export function AssistantChat({ status, history = [], company }: { status: AssistantStatus; history?: HistoryEntry[]; company: DeliveryNoteCompany }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(() => fromHistory(history));
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [creditsLeft, setCreditsLeft] = useState(status.creditsLeft);
  const [isPending, startTransition] = useTransition();
  const recRef = useRef<SpeechRec | null>(null);

  function send(q: string) {
    const question = q.trim();
    if (!question || isPending) return;
    setMsgs((m) => [...m, { role: "user", text: question }]);
    setText("");
    startTransition(async () => {
      try {
        const turns: { q: string; a: string }[] = [];
        for (let k = 0; k < msgs.length - 1; k++) {
          const u = msgs[k];
          const a = msgs[k + 1];
          if (u.role === "user" && a.role === "assistant") turns.push({ q: u.text, a: a.text });
        }
        const r = await askAssistant(question, turns.slice(-3));
        if (r.success) {
          setCreditsLeft(r.creditsLeft);
          setMsgs((m) => [...m, { role: "assistant", text: r.reply.answer, proposal: r.reply.proposal, state: "open", entryId: r.entryId, cost: r.cost, blocks: r.blocks, salePreview: r.salePreview, saleOk: r.saleOk }]);
        } else {
          setMsgs((m) => [...m, { role: "assistant", text: r.error, proposal: null }]);
        }
      } catch {
        setMsgs((m) => [...m, { role: "assistant", text: "No pude conectar con el asistente. Revisa tu conexión e intenta de nuevo.", proposal: null }]);
      }
    });
  }

  function apply(index: number, p: Proposal, entryId?: string | null) {
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof applyProposal>>;
      try {
        r = await applyProposal(p, entryId);
      } catch {
        r = { success: false, error: "No se pudo aplicar el cambio. Intenta de nuevo." };
      }
      setMsgs((m) =>
        m.map((x, i) =>
          i === index && x.role === "assistant"
            ? { ...x, state: r.success ? "applied" : "open", canUndo: r.success && !!entryId, note: r.success ? r.summary : r.error }
            : x
        )
      );
      if (r.success) {
        router.refresh();
      }
    });
  }

  function undo(index: number, entryId: string) {
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof undoProposal>>;
      try {
        r = await undoProposal(entryId);
      } catch {
        r = { success: false, error: "No se pudo deshacer el cambio. Intenta de nuevo." };
      }
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
    <section className="flex min-h-[480px] flex-col overflow-hidden rounded-[19px] bg-card shadow-(--shadow-card)">
      <div className="flex min-h-[360px] max-h-[62vh] flex-1 flex-col gap-3 overflow-y-auto px-4 py-[18px]" aria-live="polite">
        {msgs.length === 0 ? (
          <>
            <div className="px-1.5 pb-1 pt-2.5 text-center">
              <span className="kr-orb inline-grid size-14 place-items-center rounded-full text-white" aria-hidden>
                <SparklesIcon className="size-[26px]" />
              </span>
              <h2 className="mb-1 mt-3 text-[clamp(1.4rem,4vw,1.9rem)] font-bold tracking-[-0.03em]">¿Qué hacemos hoy por tu negocio?</h2>
              <p className="mx-auto max-w-[46ch] text-muted-foreground">
                Pregúntame lo que quieras de tu negocio: datos, gráficos, PDF o una venta. Cada consulta usa créditos; las acciones se confirman antes de aplicarse.
              </p>
            </div>
            <div className="mt-2.5 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,250px),1fr))" }}>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  disabled={isPending}
                  onClick={() => send(s.prompt)}
                  className="flex flex-col gap-1 rounded-[18px] border-2 border-transparent bg-muted p-3.5 text-left transition duration-150 hover:border-primary active:scale-[0.98] disabled:opacity-60"
                >
                  <span className="mb-1 grid size-[34px] place-items-center rounded-xl bg-primary/12 text-primary">
                    <s.Icon className="size-[18px]" />
                  </span>
                  <b className="text-[15px]">{s.title}</b>
                  <small className="text-[12.5px] leading-[1.35] text-muted-foreground">{s.desc}</small>
                </button>
              ))}
            </div>
          </>
        ) : (
          msgs.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="max-w-[min(100%,560px)] self-end rounded-[20px] rounded-br-[6px] bg-primary px-3.5 py-3 font-semibold text-primary-foreground">
                {m.text}
              </div>
            ) : (
              <div key={i} className="flex w-full max-w-[min(100%,560px)] flex-col self-start rounded-[20px] rounded-bl-[6px] bg-muted px-3.5 py-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                  <SparklesIcon className="size-3.5" aria-hidden /> Asistente IA
                  {m.cost != null && <span className="ml-auto rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-bold">−{m.cost} {m.cost === 1 ? "crédito" : "créditos"}</span>}
                </div>
                <p className="mb-2 mt-1 whitespace-pre-wrap">{m.text}</p>
                {m.blocks && m.blocks.length > 0 && <AssistantBlocks blocks={m.blocks} company={company} />}
                {m.proposal && m.state !== "dropped" && (
                  <div className={`rounded-2xl border-2 bg-card px-3.5 py-3 shadow-(--shadow-card) ${m.state === "applied" ? "border-success" : "border-transparent"}`}>
                    <div className="mb-1 flex flex-col">
                      <b>{describe(m.proposal)}</b>
                    </div>
                    {m.proposal.type === "SALE" && m.salePreview && m.state !== "applied" && <SalePreviewCard p={m.salePreview} />}
                    {m.state === "undone" ? (
                      <p className="mt-2.5 text-muted-foreground">{m.note}</p>
                    ) : m.state === "applied" ? (
                      <div className="mt-2.5 flex flex-wrap items-center gap-3">
                        <span className="grid size-7 place-items-center rounded-full bg-success text-success-foreground" aria-hidden>
                          <CheckIcon className="size-4" />
                        </span>
                        <div>
                          <b>Listo</b>
                          <div className="text-muted-foreground">{m.note}</div>
                        </div>
                        {m.canUndo && m.entryId && (
                          <Button size="sm" variant="outline" disabled={isPending} onClick={() => undo(i, m.entryId as string)}>
                            Deshacer · gratis 24 h
                          </Button>
                        )}
                      </div>
                    ) : (
                      <>
                        <p className="mb-2.5 mt-2 text-xs text-muted-foreground">
                          Esta acción ya está incluida en el costo de esta consulta. Revisa la vista previa y confirma solo si es correcta.
                        </p>
                        {m.note && <p className="mb-2 text-xs text-destructive">{m.note}</p>}
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isPending || (m.proposal.type === "SALE" && m.saleOk === false)}
                            onClick={() => apply(i, m.proposal as Proposal, m.entryId)}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground transition-transform active:scale-[0.97] disabled:opacity-50"
                          >
                            <CheckIcon className="size-4" aria-hidden /> Confirmar y aplicar
                          </button>
                          <button
                            type="button"
                            onClick={() => setMsgs((all) => all.map((x, j) => (j === i && x.role === "assistant" ? { ...x, state: "dropped" } : x)))}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-muted px-3.5 text-[13px] font-semibold text-primary transition-transform active:scale-[0.97]"
                          >
                            Descartar
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          )
        )}
        {isPending && (
          <div className="w-full max-w-[min(100%,560px)] self-start rounded-[20px] rounded-bl-[6px] bg-muted px-3.5 py-3" role="status" aria-label="Pensando">
            <span className="inline-flex gap-1 px-0.5 py-1.5">
              <i className="kr-typing size-2 rounded-full bg-muted-foreground" />
              <i className="kr-typing size-2 rounded-full bg-muted-foreground [animation-delay:.15s]" />
              <i className="kr-typing size-2 rounded-full bg-muted-foreground [animation-delay:.3s]" />
            </span>
          </div>
        )}
      </div>

      <form
        className="border-t bg-card px-3 pb-3 pt-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <div className="mx-1 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            <b>{AI_ASK_COST} crédito</b> por consulta · <b>{AI_BIG_COST} créditos</b> por documento o consulta grande
          </span>
          <span className="ml-auto tabular-nums">Créditos: <b>{creditsLeft}</b></span>
          {msgs.length > 0 && (
            <button type="button" onClick={() => { setMsgs([]); setText(""); }} className="font-semibold text-primary">
              Nueva conversación
            </button>
          )}
        </div>
        {msgs.length >= MAX_CONVERSATION_MESSAGES && (
          <p role="status" className="mx-1 mb-2 rounded-xl bg-warning/18 px-3 py-2 text-xs font-semibold text-warning">
            Esta conversación ya es larga y el asistente solo recuerda lo más reciente. Empieza una nueva para mejores respuestas.
          </p>
        )}
        <div className="flex gap-2">
          <input
            aria-label="Tu solicitud"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={listening ? "Escuchando… habla ahora" : "Escribe o dicta lo que necesitas…"}
            maxLength={MAX_QUESTION_CHARS}
            autoComplete="off"
            className="min-h-12 min-w-0 flex-1 rounded-full border-[1.5px] bg-background px-[18px] outline-none focus-visible:border-ring"
          />
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            aria-label={listening ? "Detener dictado" : "Dictar por voz"}
            title="Dictar por voz"
            className={`grid size-12 shrink-0 place-items-center rounded-full border-[1.5px] transition active:scale-[0.94] ${listening ? "kr-mic border-transparent bg-destructive text-white" : "bg-background text-primary"}`}
          >
            <MicIcon className="size-5" />
          </button>
          <button
            type="submit"
            disabled={isPending || text.trim().length < 2 || creditsLeft < AI_ASK_COST}
            aria-label="Enviar"
            className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-[0.94] disabled:opacity-50"
          >
            <SendIcon className="size-5" />
          </button>
        </div>
      </form>
    </section>
  );
}
