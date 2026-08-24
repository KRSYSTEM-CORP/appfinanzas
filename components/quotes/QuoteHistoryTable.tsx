"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Quote, QuoteStatus, ReferenceCurrency } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  const now = Date.now();
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todos" />
              </TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Nº control</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Días pendiente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Facturación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((q) => (
              <TableRow key={q.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selected.has(q.id)}
                    onChange={() => toggleOne(q.id)}
                    aria-label={`Seleccionar presupuesto ${q.controlNumber ?? q.id}`}
                  />
                </TableCell>
                <TableCell>{formatDate(q.createdAt)}</TableCell>
                <TableCell>{q.controlNumber ?? "—"}</TableCell>
                <TableCell>{`${q.customerFirstName ?? ""} ${q.customerLastName ?? ""}`.trim() || "—"}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrencyCents(referenceCurrency, q.totalCents)}
                </TableCell>
                <TableCell>{q.status === "PENDING" ? `${daysPending(q.createdAt)} días` : "—"}</TableCell>
                <TableCell>
                  <QuoteStatusButtons
                    quoteId={q.id}
                    status={q.status}
                    disabled={isPending}
                    onChange={handleStatusChange}
                  />
                </TableCell>
                <TableCell>
                  {q.sale ? (
                    <Link href="/documents" className="inline-flex">
                      <Badge variant="success">
                        Facturado{q.sale.controlNumber != null ? ` · Nº ${q.sale.controlNumber}` : ""}
                      </Badge>
                    </Link>
                  ) : q.status === "PENDING" ? (
                    <Button
                      type="button"
                      size="xs"
                      nativeButton={false}
                      render={<Link href={`/pos?fromQuote=${q.id}`} />}
                    >
                      Facturar
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Aún no hay presupuestos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
