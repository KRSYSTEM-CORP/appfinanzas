"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/SectionCard";
import { Meter, Pill } from "@/components/shared/Pills";
import { CompanySheet } from "@/components/admin/CompaniesView";
import { EmptyCard, formatDate } from "@/components/admin/platform-ui";
import { PLANS, type PlanId } from "@/lib/plans";
import { fillTemplate, usageLine, whatsappUrl, type UsageLine } from "@/lib/platform-logic";
import type { DirectoryRow } from "@/lib/actions/platform";

const NEXT_PLAN: Record<PlanId, PlanId | null> = { EMPRENDE: "PYME", PYME: "CORPORATIVO", CORPORATIVO: null };

function Line({ label, u, unit }: { label: string; u: UsageLine; unit?: string }) {
  const tone = u.over ? "bad" : u.near ? "warn" : "brand";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-2 text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <b className="tabular-nums">{u.used}{u.limit != null ? ` / ${u.limit}` : " · sin tope"}{unit ?? ""}</b>
      </div>
      <Meter pct={u.ratio != null ? u.ratio * 100 : 0} tone={tone} />
    </div>
  );
}

// Uso por empresa contra los límites de su plan; resalta las que están cerca del tope.
export function UsageView({ rows, nowIso }: { rows: DirectoryRow[]; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [onlyNear, setOnlyNear] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);

  const data = useMemo(
    () =>
      rows
        .filter((c) => c.ownerStatus !== "PENDING")
        .map((c) => {
          const def = PLANS[c.plan as PlanId] ?? PLANS.CORPORATIVO;
          const users = usageLine(c.usersActive, def.maxUsers);
          const products = usageLine(c.productCount, def.maxProducts);
          const credits = usageLine(c.aiCreditsUsed, def.aiCredits + c.aiCreditsExtra > 0 ? def.aiCredits + c.aiCreditsExtra : null);
          return { c, def, users, products, credits, near: users.near || products.near || credits.near };
        })
        .sort((a, b) => Number(b.near) - Number(a.near)),
    [rows]
  );
  const shown = onlyNear ? data.filter((d) => d.near) : data;
  const target = plan ? rows.find((r) => r.id === plan) ?? null : null;

  return (
    <div className="flex flex-col gap-3.5">
      <SectionCard
        title="Uso y límites por empresa"
        subtitle={`${data.filter((d) => d.near).length} de ${data.length} están al 80 % o más de un límite: buen momento para ofrecerles un plan mayor`}
        action={<Button variant={onlyNear ? "default" : "outline"} onClick={() => setOnlyNear((v) => !v)}>{onlyNear ? "Ver todas" : "Solo cerca del tope"}</Button>}
      >
        {shown.length === 0 ? (
          <EmptyCard>Ninguna empresa está cerca de su tope.</EmptyCard>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-3.5">
            {shown.map(({ c, def, users, products, credits, near }) => {
              const nextPlan = NEXT_PLAN[def.id];
              const wa = nextPlan
                ? whatsappUrl(c.phone, fillTemplate(`Hola {{empresa}}, vimos que tu negocio está creciendo y se acerca al límite de tu plan {{plan}}. Te contamos cómo pasar al plan ${PLANS[nextPlan].label} cuando quieras.`, c, now))
                : null;
              return (
                <div key={c.id} className="flex flex-col gap-2.5 rounded-[19px] border p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <b className="block truncate">{c.name}</b>
                      <small className="text-xs text-muted-foreground">{c.lastActivityAt ? `Última venta ${formatDate(c.lastActivityAt)}` : "Sin ventas registradas"}</small>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Pill tone="val">{def.label}</Pill>
                      {near && <Pill tone="warn">Cerca del tope</Pill>}
                    </div>
                  </div>
                  <Line label="Usuarios" u={users} />
                  <Line label="Productos" u={products} />
                  <Line label="Créditos de IA usados" u={credits} />
                  {near && nextPlan && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button onClick={() => setPlan(c.id)}>Pasar a {PLANS[nextPlan].label}</Button>
                      {wa && <Button variant="outline" render={<a href={wa} target="_blank" rel="noopener noreferrer" />}>Ofrecer por WhatsApp</Button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
      {target && <CompanySheet key={target.id} kind="plan" company={target} onClose={() => setPlan(null)} />}
    </div>
  );
}
