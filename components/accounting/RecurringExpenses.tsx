"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/SectionCard";
import { Pill } from "@/components/shared/Pills";
import { createExpense } from "@/lib/actions/finance";
import { money } from "@/lib/money-display";
import { todayDateString } from "@/lib/report-types";
import type { RecurringExpense } from "@/lib/recurring-expenses";

const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// «Gastos recurrentes · Aviso antes del vencimiento»: detectados de los gastos que se repiten cada mes.
// «Registrar ahora» anota el gasto de hoy con el mismo monto.
export function RecurringExpenses({ items, referenceCurrency, localCurrencyCode }: { items: RecurringExpense[]; referenceCurrency: string; localCurrencyCode: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function register(r: RecurringExpense) {
    const fd = new FormData();
    fd.set("description", r.description);
    fd.set("category", r.category ?? "");
    const local = r.enteredInLocal && r.localAmountCents != null;
    fd.set("amount", String((local ? r.localAmountCents! : r.amountCents) / 100));
    fd.set("currency", local ? "LOCAL" : "REFERENCE");
    fd.set("spentAt", todayDateString());
    start(async () => {
      const res = await createExpense(fd);
      if (!res.success) toast.error(res.error);
      else toast.success(`Gasto registrado: ${r.description}`);
      router.refresh();
    });
  }
  return (
    <SectionCard title="Gastos recurrentes" subtitle="Aviso antes del vencimiento">
      {items.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Cuando un gasto se repita dos meses seguidos aparecerá aquí con su próximo vencimiento.</p>
      ) : (
        items.map((r) => {
          const [, m, d] = r.dueDate.split("-").map(Number);
          return (
            <div key={`${r.description}${r.category}`} className="flex flex-wrap items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
              <div className="min-w-0">
                <b>{r.description}</b>
                <small className="block text-xs text-muted-foreground">
                  {r.category ?? "Otros"} · vence el {d} {SHORT[m - 1]}
                </small>
              </div>
              <div className="flex items-center gap-2">
                {r.daysLeft < 0 ? (
                  <Pill tone="bad">Vencido hace {-r.daysLeft} días</Pill>
                ) : r.daysLeft <= 5 ? (
                  <Pill tone="warn">{r.daysLeft === 0 ? "Vence hoy" : `Vence en ${r.daysLeft} días`}</Pill>
                ) : (
                  <Pill>En {r.daysLeft} días</Pill>
                )}
                <b className="tabular-nums">
                  {r.enteredInLocal && r.localAmountCents != null ? money(localCurrencyCode, r.localAmountCents) : money(referenceCurrency, r.amountCents)}
                </b>
                <Button variant="outline" disabled={pending} onClick={() => register(r)}>
                  Registrar ahora
                </Button>
              </div>
            </div>
          );
        })
      )}
    </SectionCard>
  );
}
