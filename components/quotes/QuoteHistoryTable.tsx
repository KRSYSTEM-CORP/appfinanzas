"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon } from "lucide-react";
import Link from "next/link";
import type { Quote, QuoteStatus, ReferenceCurrency } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { MasterDetail, MobileRow } from "@/components/shared/MasterDetail";
import { formatCurrencyCents } from "@/lib/currencies";
import { formatDate, QUOTE_STATUS_LABELS } from "@/lib/format";
import { updateQuoteStatus, updateQuoteStatusBulk } from "@/lib/actions/quotes";

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

  // Most recent quote first, regardless of status.
  const sorted = useMemo(() => {
    return [...quotes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [quotes]);

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

  function handleStatusChange(quoteId: string, status: QuoteStatus) {
    startTransition(async () => {
      await updateQuoteStatus(quoteId, status);
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
        renderDetail={(q) => (
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
        )}
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
  );
}
