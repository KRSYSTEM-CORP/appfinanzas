"use client";

import { useMemo, useState } from "react";
import { LandmarkIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { Pill } from "@/components/shared/Pills";
import type { CashClosingSummary } from "@/lib/actions/cash-closing";
import { grandTotals, groupIncomeByMethod, type IncomeRow } from "@/lib/income-by-method";
import { ACCOUNT_KIND_LABELS, bankLogoSrc, defaultBankKey, type AccountKind } from "@/lib/payment-accounts";
import { money } from "@/lib/money-display";

function Logo({ row }: { row: IncomeRow }) {
  const kind = row.kind as AccountKind | null;
  const src = bankLogoSrc(row.bankKey ?? (kind && kind in ACCOUNT_KIND_LABELS ? defaultBankKey(kind) : null));
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[12px] border bg-card">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="max-h-[70%] max-w-[80%] object-contain" />
      ) : row.accountId ? (
        <LandmarkIcon className="size-5 text-primary" aria-hidden />
      ) : (
        <WalletIcon className="size-5 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

function kindLabel(kind: string | null): string {
  if (kind === "PUNTO_DE_VENTA") return "Punto de venta";
  return kind && kind in ACCOUNT_KIND_LABELS ? ACCOUNT_KIND_LABELS[kind as AccountKind] : "";
}

// «Ingresos por método»: lo cobrado en el turno/caja abierta por cuenta y método.
export function IncomeByMethodDialog({ summary, referenceCurrency }: { summary: CashClosingSummary; referenceCurrency: string }) {
  const [open, setOpen] = useState(false);
  const sections = useMemo(() => groupIncomeByMethod(summary.byAccount), [summary.byAccount]);
  const total = useMemo(() => grandTotals(sections), [sections]);
  const ref = (c: number) => money(referenceCurrency, c);
  const title = summary.shiftNumber != null ? `Turno ${summary.shiftNumber}${summary.responsibleName ? ` · ${summary.responsibleName}` : ""}` : "Todo el día";

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Ingresos por método
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ingresos por método · {title}</DialogTitle>
            <DialogDescription>
              {summary.shiftNumber == null
                ? "Total del día de todas las sucursales. Elige una sede para ver lo cobrado por caja."
                : "Lo cobrado en esta caja, por cuenta y método."}
            </DialogDescription>
          </DialogHeader>

          {sections.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay cobros en esta caja.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <KpiGrid>
                <Kpi label="Total cobrado" value={ref(total.refCents)} hint={`${total.count} cobros`} />
              </KpiGrid>
              {sections.map((s) => (
                <section key={s.key} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{s.title}</h3>
                    <Pill tone="val">
                      {s.count} · {ref(s.refCents)}
                    </Pill>
                  </div>
                  <div className="flex flex-col divide-y rounded-[19px] bg-card px-3 shadow-(--shadow-card)">
                    {s.rows.map((r, i) => {
                      const detail = [kindLabel(r.kind), r.accountNumber].filter(Boolean).join(" · ");
                      return (
                        <div key={`${r.accountId ?? r.paymentMethod}-${r.currencyCode}-${i}`} className="flex items-center gap-3 py-3 text-sm">
                          <Logo row={r} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold">{r.label || kindLabel(r.kind) || "Cuenta"}</span>
                            {detail && <span className="block truncate text-xs text-muted-foreground">{detail}</span>}
                            <span className="block text-xs text-muted-foreground">{r.count} {r.count === 1 ? "cobro" : "cobros"}</span>
                          </span>
                          <span className="text-right">
                            <span className="block font-extrabold tabular-nums">{money(r.currencyCode, r.cents)}</span>
                            {r.currencyCode !== referenceCurrency && (
                              <span className="block text-xs text-muted-foreground tabular-nums">ref. {ref(r.refCents)}</span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between gap-3 py-3 text-sm font-bold">
                      <span>Total {s.title.toLowerCase()}</span>
                      <span className="text-right tabular-nums">
                        {s.byCurrency.map((c) => (
                          <span key={c.currencyCode} className="block">{money(c.currencyCode, c.cents)}</span>
                        ))}
                      </span>
                    </div>
                  </div>
                </section>
              ))}
              <div className="flex items-center justify-between gap-3 text-sm font-extrabold">
                <span>Total general</span>
                <span className="text-right tabular-nums">
                  {total.byCurrency.map((c) => (
                    <span key={c.currencyCode} className="block">{money(c.currencyCode, c.cents)}</span>
                  ))}
                  <span className="block text-xs font-normal text-muted-foreground">ref. {ref(total.refCents)}</span>
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
