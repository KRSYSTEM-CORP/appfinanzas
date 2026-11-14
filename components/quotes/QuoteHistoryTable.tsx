"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckIcon, EyeIcon, FlagIcon, MoreVerticalIcon, PhoneIcon, PrinterIcon, SearchIcon, StickyNoteIcon, TargetIcon, ZapIcon } from "lucide-react";
import type { Quote, QuoteStatus, ReferenceCurrency } from "@prisma/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { WhatsappIcon } from "@/components/ui/whatsapp-icon";
import { eurCentsToLocal, formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { formatDate } from "@/lib/format";
import { whatsappLink } from "@/lib/marketing";
import {
  addQuoteFollowUp,
  deleteQuote,
  duplicateQuote,
  getQuote,
  markQuoteStage,
  setQuoteReminder,
  updateQuoteStatus,
} from "@/lib/actions/quotes";
import { FOLLOW_UP_KINDS, QUOTE_LOST_REASONS, closeProbability, daysToExpire, expiryPill, nextStepSuggestion, type FollowUpKind } from "@/lib/quote-follow-up";
import { buildQuotePDF, quoteControlNumberLabel } from "@/lib/quote-pdf";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";

type QuoteWithSale = Omit<Quote, "exchangeRate"> & {
  exchangeRate: number | null;
  sale: { id: string; controlNumber: number | null } | null;
  followUps?: { id: string; kind: string; text: string | null; createdAt: Date }[];
};
type QuoteDetail = NonNullable<Awaited<ReturnType<typeof getQuote>>>;

const FILTERS: { key: "ALL" | QuoteStatus; label: string }[] = [
  { key: "ALL", label: "Todos" },
  { key: "PENDING", label: "Pendiente" },
  { key: "CONVERTED", label: "Convertido" },
  { key: "LOST", label: "Perdido" },
];

const TONE = {
  ok: "bg-success/14 text-success",
  warn: "bg-warning/18 text-warning",
  bad: "bg-destructive/12 text-destructive",
} as const;

const customerName = (q: Pick<Quote, "customerFirstName" | "customerLastName">) => `${q.customerFirstName ?? ""} ${q.customerLastName ?? ""}`.trim() || "—";
const preLabel = (q: Pick<Quote, "controlNumber">) => `PRE-${String(q.controlNumber ?? "—").padStart(4, "0")}`;

// Píldora con punto (estado/vigencia), como .st de la preview.
function StatusPill({ tone, children }: { tone: keyof typeof TONE; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold before:size-[7px] before:rounded-full before:bg-current before:content-[''] ${TONE[tone]}`}>
      {children}
    </span>
  );
}

const sheetPill = "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold [&_svg]:size-[13px]";

export function QuoteHistoryTable({
  quotes,
  referenceCurrency,
  rate,
  currencyCode,
  exchangeRateEnabled,
  company,
}: {
  quotes: QuoteWithSale[];
  referenceCurrency: ReferenceCurrency;
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  company: DeliveryNoteCompany;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | QuoteStatus>("ALL");
  const [now] = useState(() => new Date());
  const [panel, setPanel] = useState<{ kind: "menu" | "view" | "lost" | "del"; id: string } | null>(null);
  const [lostReason, setLostReason] = useState<string>(QUOTE_LOST_REASONS[0]);
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return quotes
      .filter((x) => statusFilter === "ALL" || x.status === statusFilter)
      .filter((x) => !q || `${customerName(x)} ${preLabel(x)} ${x.controlNumber ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [quotes, query, statusFilter]);

  const current = panel ? quotes.find((x) => x.id === panel.id) ?? null : null;
  const panelKind = current ? panel?.kind : null;
  const viewId = panelKind === "view" ? current?.id : null;

  // Los productos del presupuesto se piden al abrir el detalle (la lista no los trae).
  useEffect(() => {
    if (!viewId) return;
    let live = true;
    getQuote(viewId).then((d) => {
      if (live) setDetail(d);
    });
    return () => {
      live = false;
    };
  }, [viewId]);

  function money(cents: number) {
    return formatCurrencyCents(referenceCurrency, cents);
  }
  function bs(q: QuoteWithSale) {
    const r = q.exchangeRate ?? rate;
    if (!exchangeRateEnabled || r == null) return null;
    return formatLocalCurrency(eurCentsToLocal(q.totalCents, r), currencyCode);
  }
  function close() {
    setPanel(null);
    setDetail(null);
    setNoteDraft(null);
    setMessage(null);
  }
  function run(fn: () => Promise<unknown>, after?: () => void) {
    startTransition(async () => {
      await fn();
      router.refresh();
      after?.();
    });
  }
  function waUrl(q: QuoteWithSale) {
    if (!q.customerPhone) return null;
    const first = (q.customerFirstName ?? "").trim();
    const days = daysToExpire(q.validUntil);
    const vence = q.validUntil ? ` (vence el ${formatDate(q.validUntil)})` : days == null ? "" : "";
    return whatsappLink(q.customerPhone, `Hola ${first}, te envío el presupuesto ${preLabel(q)} por ${money(q.totalCents)}${vence}. ¿Lo confirmamos?`);
  }
  function sendWhatsapp(q: QuoteWithSale) {
    const url = waUrl(q);
    if (!url) {
      setMessage("Este presupuesto no tiene teléfono del cliente.");
      return;
    }
    window.open(url, "_blank", "noopener");
    run(() => markQuoteStage(q.id, "SENT", true), close);
  }
  async function printOrShare(q: QuoteWithSale) {
    const full = await getQuote(q.id);
    if (!full) return;
    const doc = await buildQuotePDF(full, company, full.exchangeRate ?? rate, currencyCode, exchangeRateEnabled, referenceCurrency, "letter", full.useLocalCurrency);
    const url = URL.createObjectURL(doc.output("blob") as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presupuesto-${quoteControlNumberLabel(full)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    close();
  }

  const pillRow = (q: QuoteWithSale) => {
    const days = daysToExpire(q.validUntil, now);
    const pill = q.status === "PENDING" ? expiryPill(days) : null;
    const prob = q.status === "PENDING" ? closeProbability(q, q.followUps?.length ?? 0, now) : null;
    return (
      <>
        {q.status === "CONVERTED" && <StatusPill tone="ok">Convertido</StatusPill>}
        {q.status === "LOST" && <StatusPill tone="bad">Perdido</StatusPill>}
        {pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
        {prob != null && (
          <span className={`${sheetPill} ${TONE[prob >= 65 ? "ok" : prob >= 35 ? "warn" : "bad"]}`} title="Probabilidad de cierre según días, cliente y si lo abrió">
            <TargetIcon aria-hidden /> {prob} % de cierre
          </span>
        )}
        {q.status === "PENDING" && q.viewedAt && (
          <span className={`${sheetPill} bg-muted text-muted-foreground`}>
            <EyeIcon aria-hidden /> Visto
          </span>
        )}
      </>
    );
  };

  const timeline = (q: QuoteWithSale) => {
    const rows: { at: Date; text: string }[] = [{ at: q.createdAt, text: `Creado${q.sellerName ? ` por ${q.sellerName}` : ""}` }];
    if (q.sentAt) rows.push({ at: q.sentAt, text: "Enviado por WhatsApp" });
    if (q.viewedAt) rows.push({ at: q.viewedAt, text: "Visto por el cliente" });
    if (q.remindAt) rows.push({ at: q.remindAt, text: "Recordatorio programado" });
    for (const f of q.followUps ?? []) rows.push({ at: f.createdAt, text: `${FOLLOW_UP_KINDS[f.kind as FollowUpKind] ?? f.kind}${f.text ? ` — ${f.text}` : ""}` });
    return rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  };

  const menuItem = "min-h-12 rounded-[14px] bg-muted px-4 text-left text-[15px] font-bold disabled:opacity-50";

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <SearchIcon className="pointer-events-none absolute left-[15px] top-1/2 size-[19px] -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar cliente o número"
            aria-label="Buscar presupuesto"
            className="min-h-[46px] w-full rounded-full border-[1.5px] border-border bg-card pl-11 pr-[18px] text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        {FILTERS.map((f) => (
          <Chip key={f.key} active={statusFilter === f.key} onClick={() => setStatusFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="py-[30px] text-center text-muted-foreground">No hay presupuestos con ese filtro en este periodo.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3.5 md:grid-cols-3">
          {list.map((q) => {
            const suggestion = nextStepSuggestion(q, now);
            const bsText = bs(q);
            const wa = waUrl(q);
            return (
              <article key={q.id} className="flex min-w-0 flex-col gap-0.5 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate">{customerName(q)}</b>
                    <small className="block text-xs text-muted-foreground">
                      {preLabel(q)} · {formatDate(q.createdAt)}
                    </small>
                  </div>
                  <button
                    type="button"
                    aria-label={`Acciones de ${preLabel(q)}`}
                    onClick={() => setPanel({ kind: "menu", id: q.id })}
                    className="inline-grid size-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <MoreVerticalIcon className="size-5" aria-hidden />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-col">
                  <b className="text-[26px] tracking-[-0.03em] tabular-nums">{money(q.totalCents)}</b>
                  {bsText && <small className="text-xs text-muted-foreground">{bsText}</small>}
                </div>
                <div className="my-1.5 flex flex-wrap items-center gap-2">{pillRow(q)}</div>
                {suggestion && (
                  <p className="mb-2.5 mt-1 flex items-start gap-2 rounded-[12px] bg-primary/12 px-2.5 py-2 text-[13px] font-semibold text-primary">
                    <ZapIcon className="mt-px size-4 shrink-0" aria-hidden /> {suggestion}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2">
                  {q.status === "PENDING" && (
                    <>
                      <Link href={`/pos?fromQuote=${q.id}`} className={buttonVariants({})}>
                        <CheckIcon className="size-[17px]" aria-hidden /> Facturar
                      </Link>
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener"
                          onClick={() => void markQuoteStage(q.id, "SENT", true).then(() => router.refresh())}
                          className={buttonVariants({ variant: "secondary" })}
                        >
                          <WhatsappIcon className="size-[17px]" /> Enviar
                        </a>
                      ) : (
                        <Button type="button" variant="secondary" disabled title="Sin teléfono del cliente">
                          <WhatsappIcon className="size-[17px]" /> Enviar
                        </Button>
                      )}
                    </>
                  )}
                  <Button type="button" variant="secondary" onClick={() => setPanel({ kind: "view", id: q.id })}>
                    Ver
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={current != null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {current && panelKind === "menu" && (
            <>
              <DialogTitle className="text-xl font-bold tracking-[-0.02em]">{preLabel(current)}</DialogTitle>
              <DialogDescription>{customerName(current)}</DialogDescription>
              {message && <p className="text-sm text-destructive">{message}</p>}
              <div className="mt-1 flex flex-col gap-1.5">
                <button type="button" className={menuItem} onClick={() => setPanel({ kind: "view", id: current.id })}>
                  Ver detalle y seguimiento
                </button>
                <button type="button" className={menuItem} onClick={() => void printOrShare(current)}>
                  Imprimir o compartir
                </button>
                <button type="button" className={menuItem} onClick={() => sendWhatsapp(current)}>
                  Enviar por WhatsApp
                </button>
                {current.status === "PENDING" && (
                  <>
                    <button type="button" className={menuItem} onClick={() => router.push(`/pos?fromQuote=${current.id}`)}>
                      Facturar (abrir en POS)
                    </button>
                    {!current.viewedAt && (
                      <button type="button" className={menuItem} disabled={isPending} onClick={() => run(() => markQuoteStage(current.id, "VIEWED", true), close)}>
                        Marcar como visto
                      </button>
                    )}
                    <button type="button" className={menuItem} onClick={() => setPanel({ kind: "lost", id: current.id })}>
                      Marcar perdido
                    </button>
                  </>
                )}
                <button type="button" className={menuItem} disabled={isPending} onClick={() => run(() => duplicateQuote(current.id), close)}>
                  Duplicar
                </button>
                {!current.sale && (
                  <button type="button" className={`${menuItem} bg-destructive/12 text-destructive`} onClick={() => setPanel({ kind: "del", id: current.id })}>
                    Eliminar
                  </button>
                )}
              </div>
            </>
          )}

          {current && panelKind === "view" && (
            <>
              <DialogTitle className="text-xl font-bold tracking-[-0.02em]">
                {preLabel(current)} · {customerName(current)}
              </DialogTitle>
              <DialogDescription>
                {formatDate(current.createdAt)}
                {current.validUntil ? ` · vence ${formatDate(current.validUntil)}` : ""}
                {current.sellerName ? ` · vendedor ${current.sellerName}` : ""}
              </DialogDescription>
              <div className="my-2.5 flex flex-wrap items-center gap-2">{pillRow(current)}</div>
              <div className="flex flex-col">
                {(detail?.items ?? []).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2.5 border-b py-2.5 text-sm">
                    <span>
                      {i.quantity} × {i.productName}
                    </span>
                    <b className="tabular-nums">{money(i.subtotalCents)}</b>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2.5 py-2.5 text-sm">
                  <b>Total</b>
                  <div className="text-right">
                    <b className="tabular-nums">{money(current.totalCents)}</b>
                    {bs(current) && <small className="block text-xs text-muted-foreground">{bs(current)}</small>}
                  </div>
                </div>
              </div>
              <h3 className="mt-3.5 text-[15px] font-bold">Historial y seguimiento</h3>
              <div className="ml-1.5 flex flex-col gap-2.5 border-l-2 border-border pl-4">
                {timeline(current).map((r, i) => (
                  <div key={i} className="relative flex">
                    <i className="absolute -left-[23px] top-[5px] size-3 rounded-full border-2 border-card bg-primary" />
                    <div>
                      <b className="text-sm">{r.text}</b>
                      <small className="block text-xs text-muted-foreground">{formatDate(r.at)}</small>
                    </div>
                  </div>
                ))}
              </div>
              {current.status === "PENDING" && (
                <>
                  <h3 className="mt-3.5 text-[15px] font-bold">Registrar seguimiento</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        ["CALL", PhoneIcon],
                        ["WHATSAPP", WhatsappIcon],
                        ["NOTE", StickyNoteIcon],
                      ] as const
                    ).map(([k, Icon]) => (
                      <Button
                        key={k}
                        type="button"
                        variant="secondary"
                        disabled={isPending}
                        onClick={() => (k === "NOTE" ? setNoteDraft("") : run(() => addQuoteFollowUp(current.id, k)))}
                      >
                        <Icon className="size-[17px]" aria-hidden /> {FOLLOW_UP_KINDS[k]}
                      </Button>
                    ))}
                  </div>
                  {noteDraft != null && (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Escribe la nota"
                        className="min-h-[46px] min-w-0 flex-1 rounded-[12px] border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-ring"
                      />
                      <Button
                        type="button"
                        disabled={isPending || !noteDraft.trim()}
                        onClick={() => run(() => addQuoteFollowUp(current.id, "NOTE", noteDraft), () => setNoteDraft(null))}
                      >
                        Guardar
                      </Button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <small className="text-xs text-muted-foreground">Recordarme en:</small>
                    {[1, 3, 7].map((d) => (
                      <Chip key={d} disabled={isPending} onClick={() => run(() => setQuoteReminder(current.id, d))}>
                        {d} día{d > 1 ? "s" : ""}
                      </Chip>
                    ))}
                    {current.remindAt && <small className="text-xs text-muted-foreground">Recordatorio: {formatDate(current.remindAt)}</small>}
                  </div>
                </>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {current.status === "PENDING" && (
                  <Link href={`/pos?fromQuote=${current.id}`} className={buttonVariants({})}>
                    <CheckIcon className="size-[17px]" aria-hidden /> Facturar (abrir en POS)
                  </Link>
                )}
                <Button type="button" variant="secondary" onClick={() => void printOrShare(current)}>
                  <PrinterIcon className="size-[17px]" aria-hidden /> Imprimir o compartir
                </Button>
                {current.status === "PENDING" && (
                  <Button type="button" variant="secondary" onClick={() => setPanel({ kind: "lost", id: current.id })}>
                    <FlagIcon className="size-[17px]" aria-hidden /> Marcar perdido
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={close}>
                  Cerrar
                </Button>
              </div>
            </>
          )}

          {current && panelKind === "lost" && (
            <>
              <DialogTitle className="text-xl font-bold tracking-[-0.02em]">Marcar como perdido</DialogTitle>
              <DialogDescription>Dinos el motivo para mejorar</DialogDescription>
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-muted-foreground">
                Motivo
                <select
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  className="min-h-[46px] w-full rounded-[12px] border border-input bg-background px-3 text-[15px] text-foreground outline-none focus-visible:border-ring"
                >
                  {QUOTE_LOST_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3.5 flex flex-wrap items-center gap-2">
                <Button type="button" variant="destructive" disabled={isPending} onClick={() => run(() => updateQuoteStatus(current.id, "LOST", lostReason), close)}>
                  Marcar perdido
                </Button>
                <Button type="button" variant="secondary" onClick={close}>
                  Cancelar
                </Button>
              </div>
            </>
          )}

          {current && panelKind === "del" && (
            <>
              <DialogTitle className="text-xl font-bold tracking-[-0.02em]">¿Eliminar {preLabel(current)}?</DialogTitle>
              <DialogDescription>Se quitará de la lista y del seguimiento.</DialogDescription>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button type="button" variant="destructive" disabled={isPending} onClick={() => run(() => deleteQuote(current.id), close)}>
                  Sí, eliminar
                </Button>
                <Button type="button" variant="secondary" onClick={close}>
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
