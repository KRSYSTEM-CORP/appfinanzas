"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon } from "lucide-react";
import Link from "next/link";
import type { Quote, QuoteStatus, ReferenceCurrency } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { formatCurrencyCents } from "@/lib/currencies";
import { formatDate, QUOTE_STATUS_LABELS } from "@/lib/format";
import { markQuoteStage, updateQuoteStatus, updateQuoteStatusBulk } from "@/lib/actions/quotes";
import { QUOTE_LOST_REASONS } from "@/lib/quote-follow-up";

type QuoteWithSale = Omit<Quote, "exchangeRate"> & {
  exchangeRate: number | null;
  sale: { id: string; controlNumber: number | null } | null;
};

const STATUSES: QuoteStatus[] = ["PENDING", "CONVERTED", "LOST"];

function QuoteStatusButtons({
  quoteId,
  status,
  disabled,
  onChange,
}: {
  quoteId: string;
  status: QuoteStatus;
  disabled: boolean;
  onChange: (quoteId: string, status: QuoteStatus) => void;
}) {
  return (
    <div className="flex gap-1">
      {STATUSES.map((s) => (
        <Button
          key={s}
          type="button"
          size="xs"
          variant={status === s ? "default" : "outline"}
          disabled={disabled}
          onClick={() => onChange(quoteId, s)}
        >
          {QUOTE_STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}

export function QuoteHistoryTable({
  quotes,
  referenceCurrency,
}: {
  quotes: QuoteWithSale[];
  referenceCurrency: ReferenceCurrency;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);

  // Most recent quote first, regardless of status.
  // Búsqueda por cliente o número y chips de estado, como en la preview.
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | QuoteStatus>("ALL");
  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...quotes]
      .filter((x) => statusFilter === "ALL" || x.status === statusFilter)
      .filter((x) => {
        if (!q) return true;
        const name = `${x.customerFirstName ?? ""} ${x.customerLastName ?? ""}`.toLowerCase();
        return name.includes(q) || String(x.controlNumber ?? "").includes(q);
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [quotes, query, statusFilter]);

  const openQuote = openId ? sorted.find((x) => x.id === openId) ?? null : null;
  const [now] = useState(() => Date.now());
  function daysPending(createdAt: Date): number {
    return Math.floor((now - createdAt.getTime()) / (1000 * 60 * 60 * 24));
  }

  const allSelected = sorted.length > 0 && selected.size === sorted.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sorted.map((q) => q.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Al marcar «Perdido» se pide el motivo (Precio, Compró en otro lado…).
  const [lostFor, setLostFor] = useState<string | null>(null);

  function handleStatusChange(quoteId: string, status: QuoteStatus) {
    if (status === "LOST") {
      setLostFor(quoteId);
      return;
    }
    startTransition(async () => {
      await updateQuoteStatus(quoteId, status);
      router.refresh();
    });
  }

  function confirmLost(reason: string) {
    const id = lostFor;
    setLostFor(null);
    if (!id) return;
    startTransition(async () => {
      await updateQuoteStatus(id, "LOST", reason);
      router.refresh();
    });
  }

  function toggleStage(quoteId: string, stage: "SENT" | "VIEWED", on: boolean) {
    startTransition(async () => {
      await markQuoteStage(quoteId, stage, on);
      router.refresh();
    });
  }

  function handleBulkStatus(status: QuoteStatus) {
    startTransition(async () => {
      await updateQuoteStatusBulk([...selected], status);
      setSelected(new Set());
      router.refresh();
    });
  }

  const detail = (q: QuoteWithSale) => (
          <>
            <div className="flex flex-col gap-0.5">
              <h3 className="text-lg font-semibold leading-tight">
                {`${q.customerFirstName ?? ""} ${q.customerLastName ?? ""}`.trim() || "—"}
              </h3>
              <p className="text-sm text-muted-foreground">Presupuesto Nº {q.controlNumber ?? "—"}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Fecha</dt>
                <dd className="font-medium">{formatDate(q.createdAt)}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Días pendiente</dt>
                <dd className="font-medium">{q.status === "PENDING" ? `${daysPending(q.createdAt)} días` : "—"}</dd>
              </div>
              <div className="col-span-2 flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Total</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, q.totalCents)}</dd>
              </div>
              <div className="col-span-2 flex flex-col gap-1.5">
                <dt className="text-xs text-muted-foreground">Estado</dt>
                <dd>
                  <QuoteStatusButtons quoteId={q.id} status={q.status} disabled={isPending} onChange={handleStatusChange} />
                </dd>
              </div>
              {q.status === "LOST" && (
                <div className="col-span-2 flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Motivo de la pérdida</dt>
                  <dd className="font-medium">{q.lostReason ?? "Sin motivo"}</dd>
                </div>
              )}
              <div className="col-span-2 flex flex-col gap-1.5">
                <dt className="text-xs text-muted-foreground">Seguimiento</dt>
                <dd className="flex flex-wrap gap-2">
                  <Button type="button" size="xs" variant={q.sentAt ? "default" : "outline"} disabled={isPending} onClick={() => toggleStage(q.id, "SENT", !q.sentAt)}>
                    {q.sentAt ? "Enviado ✓" : "Marcar enviado"}
                  </Button>
                  <Button type="button" size="xs" variant={q.viewedAt ? "default" : "outline"} disabled={isPending} onClick={() => toggleStage(q.id, "VIEWED", !q.viewedAt)}>
                    {q.viewedAt ? "Visto ✓" : "Marcar visto"}
                  </Button>
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              {q.sale ? (
                <Link href="/documents" className="inline-flex">
                  <Badge variant="success">
                    Facturado{q.sale.controlNumber != null ? ` · Nº ${q.sale.controlNumber}` : ""}
                  </Badge>
                </Link>
              ) : q.status === "PENDING" ? (
                <Button nativeButton={false} render={<Link href={`/pos?fromQuote=${q.id}`} />}>
                  Facturar
                </Button>
              ) : (
                <span className="text-sm text-muted-foreground">Sin facturar</span>
              )}
            </div>
          </>
        );

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted p-3">
          <span className="text-sm font-medium">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            <Button size="sm" disabled={isPending} onClick={() => handleBulkStatus("CONVERTED")}>
              Marcar como Aprobado
            </Button>
            <Button size="sm" variant="destructive" disabled={isPending} onClick={() => handleBulkStatus("LOST")}>
              Marcar como Perdido
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente o número"
          aria-label="Buscar presupuesto"
          className="h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-input bg-card px-4 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            className={`min-h-[38px] rounded-xl border-2 px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
              statusFilter === s ? "border-primary bg-primary/12 text-primary" : "border-transparent bg-muted text-foreground hover:bg-muted/70"
            }`}
          >
            {s === "ALL" ? "Todos" : QUOTE_STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="md:hidden">
      <MasterDetail
        items={sorted}
        label="Presupuestos"
        renderRowMobile={(q) => (
          <MobileRow
            title={`${q.customerFirstName ?? ""} ${q.customerLastName ?? ""}`.trim() || "—"}
            meta={`Nº ${q.controlNumber ?? "—"} · ${formatDate(q.createdAt)}`}
            badge={
              <Badge variant={q.status === "CONVERTED" ? "success" : q.status === "LOST" ? "destructive" : "outline"}>
                {QUOTE_STATUS_LABELS[q.status]}
              </Badge>
            }
            amount={<span className="font-semibold tabular-nums">{formatCurrencyCents(referenceCurrency, q.totalCents)}</span>}
          />
        )}
        header={
          <label className="flex items-center gap-2 border-b bg-muted/40 px-3.5 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Seleccionar todos los presupuestos"
              className="size-4 cursor-pointer accent-[var(--primary)]"
            />
            Seleccionar todos
          </label>
        }
        renderLead={(q) => (
          <input
            type="checkbox"
            checked={selected.has(q.id)}
            onChange={() => toggleOne(q.id)}
            aria-label={`Seleccionar presupuesto ${q.controlNumber ?? q.id}`}
            className="size-4 cursor-pointer accent-[var(--primary)]"
          />
        )}
        renderRow={(q) => (
          <>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted">
              <FileTextIcon className="size-4 text-muted-foreground/60" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {`${q.customerFirstName ?? ""} ${q.customerLastName ?? ""}`.trim() || "—"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                Nº {q.controlNumber ?? "—"} · {formatDate(q.createdAt)}
              </span>
            </span>
            <Badge variant={q.status === "CONVERTED" ? "success" : q.status === "LOST" ? "destructive" : "outline"}>
              {QUOTE_STATUS_LABELS[q.status]}
            </Badge>
            <span className="w-28 shrink-0 text-right text-sm font-medium tabular-nums">
              {formatCurrencyCents(referenceCurrency, q.totalCents)}
            </span>
          </>
        )}
        renderDetail={detail}
        empty={
          <EmptyState
            icon={FileTextIcon}
            title="Aún no hay presupuestos."
            action={{ href: "/quotes", label: "Crear presupuesto" }}
            className="rounded-lg border bg-card py-14 shadow-xs"
          />
        }
      />
      </div>
      <div className="hidden md:block">
        {sorted.length === 0 ? (
          <EmptyState
            icon={FileTextIcon}
            title="Aún no hay presupuestos."
            action={{ href: "/quotes", label: "Crear presupuesto" }}
            className="rounded-lg border bg-card py-14 shadow-xs"
          />
        ) : (
          <>
            <label className="mb-3 flex w-fit items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todos los presupuestos" className="size-4 cursor-pointer accent-[var(--primary)]" />
              Seleccionar todos
            </label>
            <ul className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {sorted.map((q) => {
                const name = `${q.customerFirstName ?? ""} ${q.customerLastName ?? ""}`.trim() || "—";
                const days = q.status === "PENDING" ? daysPending(q.createdAt) : null;
                return (
                  <li key={q.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(q.id)}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault();
                          setOpenId(q.id);
                        }
                      }}
                      className="flex h-full cursor-pointer flex-col gap-2 rounded-[20px] bg-card p-5 text-left shadow-(--shadow-card) transition-shadow hover:shadow-(--shadow-float) focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold">{name}</p>
                          <p className="text-xs text-muted-foreground">PRE-{q.controlNumber ?? "—"} · {formatDate(q.createdAt)}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={selected.has(q.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggleOne(q.id)}
                          aria-label={`Seleccionar presupuesto ${q.controlNumber ?? q.id}`}
                          className="size-4 cursor-pointer accent-[var(--primary)]"
                        />
                      </div>
                      <p className="text-2xl font-bold tabular-nums tracking-tight">{formatCurrencyCents(referenceCurrency, q.totalCents)}</p>
                      <div className="mt-auto flex flex-wrap gap-1.5">
                        <Badge variant={q.status === "CONVERTED" ? "success" : q.status === "LOST" ? "destructive" : "outline"}>{QUOTE_STATUS_LABELS[q.status]}</Badge>
                        {days != null && <Badge variant="secondary">Pendiente · {days} {days === 1 ? "día" : "días"}</Badge>}
                        {q.sale && <Badge variant="success">Facturado</Badge>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Dialog open={openQuote != null} onOpenChange={(o) => !o && setOpenId(null)}>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>Detalle del presupuesto</DialogTitle>
                </DialogHeader>
                {openQuote && <div className="flex flex-col gap-4">{detail(openQuote)}</div>}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
      <Dialog open={lostFor != null} onOpenChange={(o) => !o && setLostFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Por qué se perdió?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {QUOTE_LOST_REASONS.map((r) => (
              <Button key={r} type="button" variant="outline" disabled={isPending} onClick={() => confirmLost(r)}>
                {r}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
