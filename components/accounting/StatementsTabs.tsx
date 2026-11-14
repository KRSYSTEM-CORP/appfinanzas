"use client";

import { Fragment, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BanknoteIcon, PackageIcon, ShoppingCartIcon, TrendingDownIcon, TrendingUpIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Kpi, KpiGrid } from "@/components/shared/Kpi";
import { Pill, StatusPill } from "@/components/shared/Pills";
import { Note, SectionCard, TwoCol } from "@/components/shared/SectionCard";
import { appendSheet, downloadWorkbook, newWorkbook } from "@/lib/spreadsheet";
import { money, pct } from "@/lib/money-display";
import type { StatementTab } from "@/lib/admin-nav";
import type { MovementRow, Statements } from "@/lib/actions/statements";
import { cn } from "@/lib/utils";

const SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Traductor contable: explica cada línea en palabras simples.
const HELP: Record<string, string> = {
  income: "Lo que vendiste en el periodo, sin contar ventas anuladas.",
  cogs: "Lo que te costó la mercancía que vendiste.",
  gross: "Ingresos menos costo de ventas: lo que queda antes de pagar gastos.",
  sales: "Gastos de vender, como las comisiones de los vendedores.",
  admin: "Gastos para operar el negocio: alquiler, servicios, sueldos y similares.",
  operating: "Lo que gana el negocio con su operación normal.",
  other: "Ingresos que no vienen de vender tu mercancía.",
  islr: "Impuesto sobre la renta estimado con la tasa que elijas. Es una referencia, no una declaración.",
  net: "Lo que realmente queda después de todo, incluido el impuesto estimado.",
};

function day(ymd: string) {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d} ${SHORT[m - 1]}`;
}

// Contabilidad (preview): Movimientos, Estado de resultados, Situación financiera, Análisis de costo y Resumen de IVA.
export function StatementsTabs({
  tab,
  s,
  movements,
  currency,
  islr,
  periodLabel,
  periodBar,
  rate,
}: {
  tab: StatementTab;
  s: Statements;
  movements: MovementRow[];
  currency: string;
  islr: number;
  periodLabel: string;
  periodBar: React.ReactNode;
  rate: number | null;
}) {
  const m = (c: number, d: 0 | 2 = 2) => money(currency, c, d);
  if (tab === "mov") return <Movements movements={movements} m={m} periodBar={periodBar} periodLabel={periodLabel} />;
  if (tab === "estado") return <>{periodBar}<IncomeStatement s={s} m={m} islr={islr} periodLabel={periodLabel} /></>;
  if (tab === "sit") return <>{periodBar}<Position s={s} m={m} periodLabel={periodLabel} /></>;
  if (tab === "costo") return <>{periodBar}<CostAnalysis s={s} m={m} /></>;
  return <>{periodBar}<Iva s={s} m={m} periodLabel={periodLabel} rate={rate} /></>;
}

type M = (c: number, d?: 0 | 2) => string;

function Movements({ movements, m, periodBar, periodLabel }: { movements: MovementRow[]; m: M; periodBar: React.ReactNode; periodLabel: string }) {
  const [kind, setKind] = useState<"all" | "Ingreso" | "Egreso">("all");
  const [cat, setCat] = useState("");
  const cats = [...new Set(movements.map((r) => r.category))].sort();
  const shown = movements.filter((r) => (kind === "all" || r.kind === kind) && (!cat || r.category === cat));
  const income = movements.filter((r) => r.kind === "Ingreso").reduce((n, r) => n + r.amountCents, 0);
  const outcome = movements.filter((r) => r.kind === "Egreso").reduce((n, r) => n + r.amountCents, 0);
  const net = shown.reduce((n, r) => n + (r.kind === "Ingreso" ? r.amountCents : -r.amountCents), 0);

  async function exportXlsx() {
    const wb = newWorkbook();
    appendSheet(wb, [["Día", "Concepto", "Categoría", "Tipo", "Monto"], ...shown.map((r) => [r.date, r.label, r.category, r.kind, (r.kind === "Egreso" ? -r.amountCents : r.amountCents) / 100])], "Movimientos");
    await downloadWorkbook(wb, `movimientos-${periodLabel.replace(/[^\w-]+/g, "-")}.xlsx`);
  }

  return (
    <>
      <KpiGrid>
        <Kpi tone="ok" icon={<TrendingUpIcon />} label="Ingresos" value={m(income)} hint="Periodo elegido" />
        <Kpi tone="bad" icon={<TrendingDownIcon />} label="Egresos" value={m(outcome)} hint="Compras y gastos" />
        <Kpi tone="info" icon={<BanknoteIcon />} label="Flujo neto" value={m(income - outcome)} hint="Ingresos menos egresos" />
      </KpiGrid>
      <SectionCard flush>
        <div className="flex flex-col gap-2.5 px-4 pb-2 pt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Segmented
              label="Tipo"
              value={kind}
              onChange={setKind}
              options={[
                { value: "all", label: "Todos" },
                { value: "Ingreso", label: "Ingresos" },
                { value: "Egreso", label: "Egresos" },
              ]}
            />
            <select aria-label="Categoría" value={cat} onChange={(e) => setCat(e.target.value)} className="min-h-10 rounded-full border-0 bg-muted px-4 text-sm font-semibold">
              <option value="">Todas las categorías</option>
              {cats.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            {periodBar}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportXlsx} disabled={shown.length === 0}>
              Exportar Excel
            </Button>
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="px-4 pb-4 text-[13px] text-muted-foreground">Sin movimientos en este filtro.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-bold text-muted-foreground [&>th]:px-3.5 [&>th]:py-[11px]">
                  <th>Día</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Tipo</th>
                  <th className="text-right">Monto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={i} className="border-b [&>td]:px-3.5 [&>td]:py-[11px]">
                    <td className="whitespace-nowrap">{day(r.date)}</td>
                    <td>{r.label}</td>
                    <td>{r.category}</td>
                    <td>{r.kind === "Ingreso" ? <StatusPill tone="ok">Ingreso</StatusPill> : <StatusPill tone="bad">Egreso</StatusPill>}</td>
                    <td className={cn("text-right tabular-nums", r.kind === "Ingreso" ? "text-success" : "text-destructive")}>
                      {r.kind === "Ingreso" ? "+" : "−"}
                      {m(r.amountCents).replace("−", "")}
                    </td>
                    <td className="text-right">{r.auto && <Pill>Auto</Pill>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-bold [&>td]:px-3.5 [&>td]:py-[11px]">
                  <td />
                  <td>Total del filtro</td>
                  <td colSpan={2} />
                  <td className="text-right tabular-nums">{m(net)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <Note className="px-4 pb-4">Los movimientos «Auto» vienen de Ventas, Compras y Gastos; edítalos allí.</Note>
      </SectionCard>
    </>
  );
}

function HelpButton({ k, open, setOpen, label }: { k: string; open: string | null; setOpen: (k: string | null) => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={`Qué es ${label}`}
      aria-expanded={open === k}
      onClick={() => setOpen(open === k ? null : k)}
      className="ml-1.5 inline-grid size-[22px] place-items-center rounded-full bg-accent align-middle text-xs font-bold text-primary"
    >
      ?
    </button>
  );
}

function IncomeStatement({ s, m, islr, periodLabel }: { s: Statements; m: M; islr: number; periodLabel: string }) {
  const [help, setHelp] = useState<string | null>(null);
  const router = useRouter();
  const sp = useSearchParams();
  function setIslr(v: string) {
    const next = new URLSearchParams(sp.toString());
    next.set("islr", String(Math.max(0, Math.min(60, Number(v) || 0))));
    router.replace(`?${next.toString()}`);
  }
  const lines: { k: string; label: string; v: number; bold?: boolean }[] = [
    { k: "income", label: "Ingresos por ventas", v: s.income },
    { k: "cogs", label: "Costo de ventas", v: -s.cogs },
    { k: "gross", label: "Utilidad bruta", v: s.gross, bold: true },
    { k: "sales", label: "Gastos de ventas", v: -s.salesExpenses },
    { k: "admin", label: "Gastos de administración", v: -s.adminExpenses },
    { k: "operating", label: "Resultado de operación", v: s.operating, bold: true },
    { k: "other", label: "Otros ingresos", v: 0 },
    { k: "islr", label: "Impuesto sobre la renta estimado", v: -s.islr },
    { k: "net", label: "Resultado neto", v: s.net, bold: true },
  ];
  return (
    <>
      <SectionCard title="Estado de resultados" subtitle={`${periodLabel} · toca «?» en cualquier línea para entenderla`} action={<Pill tone="val">Traductor contable</Pill>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-bold text-muted-foreground [&>th]:px-3.5 [&>th]:py-[11px]">
                <th>Concepto</th>
                <th className="text-right">Monto</th>
                <th className="text-right">% de ingresos</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <Fragment key={l.k}>
                  <tr className={cn("border-b [&>td]:px-3.5 [&>td]:py-[11px]", l.bold && "font-bold")}>
                    <td>
                      {l.label}
                      <HelpButton k={l.k} open={help} setOpen={setHelp} label={l.label} />
                    </td>
                    <td className="text-right tabular-nums">{m(l.v)}</td>
                    <td className="text-right tabular-nums">{pct(Math.abs(l.v), s.income)}</td>
                  </tr>
                  {help === l.k && (
                    <tr>
                      <td colSpan={3} className="px-3.5 pb-2.5">
                        <p className="rounded-[12px] bg-accent p-2.5 text-[13px] text-foreground">
                          {HELP[l.k]}
                          {l.k === "islr" && (
                            <span className="mt-2 flex items-center gap-2">
                              Tasa de ISLR
                              <input aria-label="Tasa de ISLR en %" inputMode="numeric" defaultValue={islr} onBlur={(e) => setIslr(e.target.value)} className="h-8 w-16 rounded-[10px] border bg-background px-2 text-right" /> %
                            </span>
                          )}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
      <SectionCard title="Memorando" subtitle="Para cuadrar con el Resumen de Balance">
        {[
          ["Utilidad del Resumen (antes de impuesto)", m(s.operating)],
          ["Gastos de ventas = comisiones", m(s.salesExpenses)],
          ["Gastos de administración = gastos registrados", m(s.adminExpenses)],
          ["Margen bruto / margen neto", `${pct(s.gross, s.income)} / ${pct(s.net, s.income)}`],
        ].map(([a, b]) => (
          <div key={a} className="flex items-center justify-between gap-2.5 border-b py-2.5">
            <span>{a}</span>
            <b className="tabular-nums">{b}</b>
          </div>
        ))}
        <Note>El impuesto usa una tasa de {islr} %. Valídala con tu contador.</Note>
      </SectionCard>
    </>
  );
}

function Position({ s, m, periodLabel }: { s: Statements; m: M; periodLabel: string }) {
  const block = (title: string, rows: [string, number][], totalLabel: string, total: number) => (
    <SectionCard>
      <span className="kr-eyebrow">{title}</span>
      {rows.map(([l, v]) => (
        <div key={l} className="flex items-center justify-between gap-2.5 border-b py-2.5">
          <span>{l}</span>
          <span className="tabular-nums">{m(v)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2.5 pt-2.5 font-bold">
        <span>{totalLabel}</span>
        <span className="tabular-nums">{m(total)}</span>
      </div>
    </SectionCard>
  );
  const liquidity = s.liabilities > 0 ? (s.receivables + s.banks) / s.liabilities : null;
  const margin = s.income > 0 ? s.net / s.income : null;
  const debt = s.assets > 0 ? s.liabilities / s.assets : null;
  const nf = (v: number, d = 1) => new Intl.NumberFormat("es-VE", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
  const lights: { label: string; value: string; tone: "ok" | "warn" | "bad"; word: string; text: string }[] = [
    {
      label: "Liquidez",
      value: liquidity == null ? "—" : `${nf(liquidity)} veces`,
      tone: liquidity == null || liquidity >= 1.5 ? "ok" : liquidity >= 1 ? "warn" : "bad",
      word: liquidity == null ? "Sin deudas" : liquidity >= 1.5 ? "Sana" : liquidity >= 1 ? "Justa" : "Baja",
      text: liquidity == null ? "No tienes deudas a corto plazo." : `Por cada ${m(100)} que debes a corto plazo tienes ${m(Math.round(liquidity * 100))}. Más de 1,5 es cómodo.`,
    },
    {
      label: "Margen neto",
      value: margin == null ? "—" : `${nf(margin * 100)} %`,
      tone: margin == null ? "warn" : margin >= 0.1 ? "ok" : margin >= 0 ? "warn" : "bad",
      word: margin == null ? "Sin ventas" : margin >= 0.1 ? "Sano" : margin >= 0 ? "Bajo" : "Pérdida",
      text: margin == null ? "Aún no hay ventas en el periodo." : `De cada ${m(10000, 0)} vendidos te quedan ${m(Math.round(margin * 10000))} después de todo. Más de 10 % es bueno.`,
    },
    {
      label: "Endeudamiento",
      value: debt == null ? "—" : `${nf(debt * 100)} %`,
      tone: debt == null || debt < 0.4 ? "ok" : debt < 0.7 ? "warn" : "bad",
      word: debt == null || debt < 0.4 ? "Bajo" : debt < 0.7 ? "Medio" : "Alto",
      text: "Qué parte de lo que tienes se debe a terceros. Menos de 40 % es tranquilo.",
    },
  ];
  const max = Math.max(s.assets, 1);
  return (
    <>
      <p className="text-[13px] text-muted-foreground">{periodLabel} · estilo NIIF</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3.5">
        {block("Activo corriente", [["Efectivo y bancos", s.banks], ["Cuentas por cobrar", s.receivables], ["Inventarios", s.inventory]], "Total activo", s.assets)}
        {block("Pasivo corriente", [["Cuentas por pagar", s.payables], ["IVA por pagar", s.ivaPayable]], "Total pasivo", s.liabilities)}
        {block("Patrimonio", [["Activo − pasivo", s.equity]], "Total patrimonio", s.equity)}
      </div>
      <SectionCard title="La ecuación que siempre cuadra" subtitle="Activo = Pasivo + Patrimonio: lo que tienes se financia con deudas o con dinero tuyo">
        {(
          [
            ["Activo", s.assets, "bg-primary"],
            ["Pasivo", s.liabilities, "bg-bad-solid"],
            ["Patrimonio", s.equity, "bg-ok-solid"],
          ] as const
        ).map(([l, v, c]) => (
          <div key={l} className="grid grid-cols-[minmax(80px,1.1fr)_3fr_auto] items-center gap-2.5 py-[7px]">
            <span className="text-[13px] font-semibold">{l}</span>
            <div className="h-[22px] overflow-hidden rounded-full bg-track">
              <span className={`block h-full rounded-full ${c}`} style={{ width: `${(Math.max(0, v) / max) * 100}%` }} />
            </div>
            <span className="min-w-[62px] text-right text-[13px] font-bold tabular-nums">{m(v)}</span>
          </div>
        ))}
        <p className="mt-2 font-bold">
          Cuadra: {m(s.assets)} = {m(s.liabilities)} + {m(s.equity)}
        </p>
        <Note>Cada barra es proporcional al activo. Si compras mercancía a crédito, suben el activo y el pasivo a la vez: la ecuación sigue cuadrada.</Note>
      </SectionCard>
      <SectionCard title="Semáforo de razones" subtitle="Tres señales rápidas de la salud del negocio">
        {lights.map((l) => (
          <div key={l.label} className="border-b py-2.5 last:border-0">
            <div className="flex flex-wrap items-center gap-2">
              <b>
                {l.label}: {l.value}
              </b>
              <StatusPill tone={l.tone}>{l.word}</StatusPill>
            </div>
            <small className="text-xs text-muted-foreground">{l.text}</small>
          </div>
        ))}
      </SectionCard>
    </>
  );
}

function CostAnalysis({ s, m }: { s: Statements; m: M }) {
  const out = s.cogs + s.internalUse + Math.max(0, s.unexplained);
  const dev = s.cogs > 0 ? s.unexplained / s.cogs : 0;
  const maxPC = Math.max(s.purchases, s.cogs, 1);
  const diff = s.purchases - s.cogs;
  return (
    <>
      <KpiGrid>
        <Kpi tone="info" icon={<ShoppingCartIcon />} label="Compras del periodo" value={m(s.purchases, 0)} hint="Mercancía comprada" />
        <Kpi tone="warn" icon={<PackageIcon />} label="Costo de ventas" value={m(s.cogs, 0)} hint="Lo que costó lo vendido" />
        <Kpi tone={dev > 0.03 ? "bad" : dev > 0.01 ? "warn" : "ok"} icon={<TriangleAlertIcon />} label="Desviación sin explicar" value={m(s.unexplained)} hint={`${pct(s.unexplained, s.cogs)} del costo de ventas`} />
      </KpiGrid>
      <TwoCol>
        <SectionCard title="Compras frente a costo de ventas" subtitle="Comprar más de lo que vendes engorda el inventario">
          {(
            [
              ["Compras", s.purchases, "bg-primary"],
              ["Costo de ventas", s.cogs, "bg-warn-solid"],
            ] as const
          ).map(([l, v, c]) => (
            <div key={l} className="grid grid-cols-[minmax(80px,1.1fr)_3fr_auto] items-center gap-2.5 py-[7px]">
              <span className="text-[13px] font-semibold">{l}</span>
              <div className="h-[22px] overflow-hidden rounded-full bg-track">
                <span className={`block h-full rounded-full ${c}`} style={{ width: `${(v / maxPC) * 100}%` }} />
              </div>
              <span className="min-w-[62px] text-right text-[13px] font-bold tabular-nums">{m(v, 0)}</span>
            </div>
          ))}
          <Note>
            {diff >= 0
              ? `Compraste ${m(diff, 0)} más de lo que costó lo vendido: el inventario subió.`
              : `Compraste ${m(-diff, 0)} menos de lo que costó lo vendido: el inventario bajó.`}
          </Note>
        </SectionCard>
        <SectionCard title="A dónde fue la mercancía que salió" subtitle={`Salida total de inventario: ${m(out)}`}>
          {(
            [
              ["Costo de ventas", s.cogs],
              ["Consumo interno", s.internalUse],
              ["Desviación sin explicar", s.unexplained],
            ] as const
          ).map(([l, v]) => (
            <div key={l} className="flex items-center justify-between gap-2.5 border-b py-2.5 last:border-0">
              <span>{l}</span>
              <b className="tabular-nums">{m(v)}</b>
            </div>
          ))}
        </SectionCard>
      </TwoCol>
      <SectionCard title="Cómo leer la desviación" subtitle={`Desviación sin explicar ${m(s.unexplained)} · ${pct(s.unexplained, s.cogs)}`}>
        <p className="text-sm">
          La desviación es la mercancía que salió del inventario y no se puede explicar con ventas ni consumo interno. Puede ser un error de conteo, un robo o una venta sin registrar.
          Menos de 1 % del costo es normal; entre 1 % y 3 %, revisa los conteos; más de 3 %, investiga ya.
        </p>
      </SectionCard>
    </>
  );
}

function Iva({ s, m, periodLabel, rate }: { s: Statements; m: M; periodLabel: string; rate: number | null }) {
  const now = new Date();
  const nextMonth = MONTHS[(now.getMonth() + 1) % 12];
  const toPay = s.ivaBalance;
  return (
    <>
      <KpiGrid>
        <Kpi tone="info" icon={<TrendingUpIcon />} label="Débito fiscal" value={m(s.ivaDebit)} hint="IVA cobrado en ventas" />
        <Kpi tone="ok" icon={<TrendingDownIcon />} label="Crédito fiscal" value={m(s.ivaCredit)} hint="IVA pagado en compras" />
        <Kpi tone={toPay > 0 ? "warn" : "ok"} icon={<BanknoteIcon />} label={toPay >= 0 ? "IVA a pagar" : "Saldo a favor"} value={m(Math.abs(toPay))} hint={`Declarar antes del 15 ${nextMonth.slice(0, 3)}`} />
      </KpiGrid>
      <SectionCard title={`Resumen de IVA · ${periodLabel}`} subtitle="Débito menos crédito = monto a pagar al SENIAT">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-2.5">
          {(
            [
              ["Débito fiscal", s.ivaDebit, ""],
              ["Crédito fiscal", s.ivaCredit, ""],
              [toPay >= 0 ? "A pagar" : "A favor", Math.abs(toPay), "bg-warn-solid/18"],
            ] as const
          ).map(([l, v, c]) => (
            <div key={l} className={cn("flex flex-col rounded-[14px] bg-muted px-3.5 py-3", c)}>
              <small className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{l}</small>
              <b className="text-xl tabular-nums">{m(v)}</b>
            </div>
          ))}
        </div>
        <Note>
          {m(s.ivaDebit)} − {m(s.ivaCredit)} = {m(toPay)}. Solo cuentan facturas, notas de crédito y de débito; las notas de entrega y las compras sin factura no entran.
          {rate ? ` Equivale a ${money("VES", Math.round(Math.abs(toPay) * rate), 0)}.` : ""}
        </Note>
      </SectionCard>
    </>
  );
}
