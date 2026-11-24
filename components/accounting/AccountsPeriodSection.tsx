"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DownloadIcon, HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectionCard } from "@/components/shared/SectionCard";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { PeriodBar } from "@/components/shared/PeriodBar";
import { FIELD_CONTROL } from "@/components/shared/Field";
import { Logo } from "@/components/accounting/BankAccountsView";
import { formatAccountMoney } from "@/components/accounts/AddFundsDialog";
import { getAccountsPeriodMovements, type AccountsPeriodReport, type PeriodMovement } from "@/lib/actions/accounts-period";
import { buildMovementsCsv, csvFileName, type SegMode } from "@/lib/accounts-segmentation";
import { ACCOUNT_KIND_LABELS, type AccountKind } from "@/lib/payment-accounts";
import { dateRangeSelectionToQuery, type DateRangeSelection } from "@/lib/report-types";
import { cn } from "@/lib/utils";

const accName = (a: { bankName: string | null; kind: string }) => a.bankName ?? ACCOUNT_KIND_LABELS[a.kind as AccountKind] ?? a.kind;

// «Movimientos del período»: ingresos y egresos por cuenta, por caja (turno) o por fecha.
export function AccountsPeriodSection({ report, selection, seg }: { report: AccountsPeriodReport; selection: DateRangeSelection; seg: SegMode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [history, setHistory] = useState<{ accountId: string | null; rows: PeriodMovement[] | null } | null>(null);
  const spec = { seg, turno: report.selectedShift, selection };
  const rowsById = new Map(report.accounts.map((a) => [a.id, a]));

  function go(params: Record<string, string>) {
    router.push(`${pathname}?${new URLSearchParams(params).toString()}`);
  }

  async function open(accountId: string | null) {
    setHistory({ accountId, rows: null });
    try {
      setHistory({ accountId, rows: await getAccountsPeriodMovements(spec, accountId) });
    } catch {
      setHistory(null);
      toast.error("No se pudo cargar el historial");
    }
  }

  async function download(accountId: string | null, known?: PeriodMovement[] | null) {
    try {
      const rows = known ?? (await getAccountsPeriodMovements(spec, accountId));
      const csv = buildMovementsCsv(
        rows.map((m) => {
          const a = rowsById.get(m.accountId);
          return { at: m.at, account: a ? `${accName(a)} · ${a.accountNumber}` : m.accountId, kind: m.kind, label: m.label, amountCents: m.amountCents, currency: a?.currency ?? "" };
        })
      );
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = csvFileName(seg, report.from, report.to);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo generar el CSV");
    }
  }

  const segBtn = (key: SegMode, label: string) => (
    <button
      type="button"
      aria-pressed={seg === key}
      onClick={() => go(key === "fecha" ? { seg: "fecha", ...dateRangeSelectionToQuery(selection) } : { seg: "caja" })}
      className={cn("min-h-9 rounded-full px-4 text-[13px] font-bold transition-colors", seg === key ? "bg-card text-primary shadow-(--shadow-card)" : "text-muted-foreground")}
    >
      {label}
    </button>
  );

  // Totales por moneda (no se mezclan Bs con divisa).
  const totals = new Map<string, { inc: number; exp: number }>();
  for (const a of report.accounts) {
    const t = totals.get(a.currency) ?? { inc: 0, exp: 0 };
    t.inc += a.incomeCents;
    t.exp += a.expenseCents;
    totals.set(a.currency, t);
  }
  const noActivity = report.accounts.every((a) => a.count === 0);
  const historyAccount = history?.accountId ? rowsById.get(history.accountId) : null;

  return (
    <SectionCard title="Movimientos del período" subtitle="Lo que entró y salió de cada cuenta en la caja o las fechas que elijas. Los saldos de arriba no cambian.">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <div role="group" aria-label="Segmentar por" className="inline-flex gap-1 rounded-full bg-muted p-1">
          {segBtn("caja", "Por caja")}
          {segBtn("fecha", "Por fecha")}
        </div>
        {seg === "caja" && report.shifts.length > 0 && (
          <select
            aria-label="Turno de caja"
            className={cn(FIELD_CONTROL, "w-auto max-w-full")}
            value={report.selectedShift ?? ""}
            onChange={(e) => go({ seg: "caja", turno: e.target.value })}
          >
            {report.shifts.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {seg === "fecha" && (
        <PeriodBar label={report.label}>
          <DateRangeSwitcher selection={selection} extraParams={{ seg: "fecha" }} />
        </PeriodBar>
      )}

      {report.needsBranch ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Elige una sede para ver por caja. Mientras tanto puedes usar «Por fecha».</p>
      ) : seg === "caja" && report.shifts.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Esta sede no tiene cajas abiertas ni cerradas en los últimos días.</p>
      ) : report.accounts.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted-foreground">Aún no tienes cuentas activas.</p>
      ) : (
        <>
          {seg === "caja" && <p className="mt-3 text-[13px] text-muted-foreground">Caja: <b className="text-foreground">{report.label}</b></p>}
          {noActivity && <p className="mt-3 text-[13px] text-muted-foreground">No hubo movimientos en las cuentas durante este período.</p>}
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
            {report.accounts.map((a) => (
              <div key={a.id} className="flex min-w-0 flex-col gap-1 rounded-[19px] bg-muted/50 p-4">
                <div className="flex items-center gap-2.5">
                  <Logo a={{ bankKey: a.bankKey, kind: a.kind as AccountKind }} size={36} />
                  <span className="min-w-0">
                    <b className="block truncate">{accName(a)}</b>
                    <small className="text-xs text-muted-foreground">{a.count} movimiento(s)</small>
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-sm"><span className="text-muted-foreground">Ingresos</span><b className="tabular-nums text-success">+{formatAccountMoney(a.currency, a.incomeCents)}</b></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Egresos</span><b className="tabular-nums text-destructive">−{formatAccountMoney(a.currency, a.expenseCents)}</b></div>
                <div className="flex justify-between border-t pt-1.5 text-sm"><span className="text-muted-foreground">Neto</span><b className="tabular-nums">{a.netCents < 0 ? "−" : ""}{formatAccountMoney(a.currency, Math.abs(a.netCents))}</b></div>
                <Button type="button" size="sm" variant="outline" className="mt-2 self-start" onClick={() => open(a.id)}>
                  <HistoryIcon aria-hidden className="size-4" /> Historial
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 border-t pt-3">
            <div className="text-sm">
              <b>Total del período</b>
              {[...totals.entries()].map(([cur, t]) => (
                <span key={cur} className="ml-3 text-muted-foreground">
                  {cur === "VES" ? "Bs" : "Divisa"}: <span className="tabular-nums text-success">+{formatAccountMoney(cur, t.inc)}</span> / <span className="tabular-nums text-destructive">−{formatAccountMoney(cur, t.exp)}</span>
                </span>
              ))}
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => open(null)}>
              <HistoryIcon aria-hidden className="size-4" /> Historial general
            </Button>
          </div>
        </>
      )}

      {history && (
        <Dialog open onOpenChange={(v) => !v && setHistory(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Historial · {historyAccount ? accName(historyAccount) : "todas las cuentas"}</DialogTitle>
              <DialogDescription>{report.label}</DialogDescription>
            </DialogHeader>
            {history.rows === null ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : history.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay movimientos en este período.</p>
            ) : (
              <>
                <Button type="button" size="sm" className="self-start" onClick={() => download(history.accountId, history.rows)}>
                  <DownloadIcon aria-hidden className="size-4" /> Descargar CSV
                </Button>
                <ul className="flex flex-col">
                  {history.rows.map((m) => {
                    const a = rowsById.get(m.accountId);
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-3 border-b py-2.5 text-sm">
                        <span className="min-w-0">
                          <b className="block truncate">{m.label}</b>
                          <small className="text-xs text-muted-foreground">
                            {new Date(m.at).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })}
                            {!history.accountId && a ? ` · ${accName(a)}` : ""}
                          </small>
                        </span>
                        <b className={m.amountCents < 0 ? "tabular-nums text-destructive" : "tabular-nums text-success"}>
                          {m.amountCents < 0 ? "−" : "+"}
                          {formatAccountMoney(a?.currency ?? "USD", Math.abs(m.amountCents))}
                        </b>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </DialogContent>
        </Dialog>
      )}
    </SectionCard>
  );
}
