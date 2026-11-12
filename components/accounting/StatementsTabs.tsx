"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Segmented } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { formatCurrencyCents } from "@/lib/currencies";
import type { MovementRow, Statements } from "@/lib/actions/statements";

type Tab = "mov" | "res" | "sit" | "costo" | "iva";

// Traductor contable: explica cada línea en palabras simples.
const HELP: Record<string, string> = {
  income: "Lo que vendiste en el periodo, sin contar ventas anuladas.",
  cogs: "Lo que te costó la mercancía que vendiste.",
  gross: "Ingresos menos costo de ventas: lo que queda antes de pagar gastos.",
  sales: "Gastos de vender, como las comisiones de los vendedores.",
  admin: "Gastos para operar el negocio: alquiler, servicios, sueldos y similares.",
  operating: "Lo que gana el negocio con su operación normal.",
  islr: "Impuesto sobre la renta estimado con la tasa que elijas. Es una referencia, no una declaración.",
  net: "Lo que realmente queda después de todo, incluido el impuesto estimado.",
};

export function StatementsTabs({
  s,
  movements,
  currency,
  islr,
}: {
  s: Statements;
  movements: MovementRow[];
  currency: string;
  islr: number;
}) {
  const [tab, setTab] = useState<Tab>("res");
  const [filter, setFilter] = useState<"all" | "Ingreso" | "Egreso">("all");
  const [help, setHelp] = useState<string | null>(null);
  const router = useRouter();
  const sp = useSearchParams();
  const m = (c: number) => formatCurrencyCents(currency, c);

  function setIslr(v: string) {
    const next = new URLSearchParams(sp.toString());
    next.set("islr", String(Math.max(0, Math.min(60, Number(v) || 0))));
    router.replace(`?${next.toString()}`);
  }

  const income = movements.filter((r) => r.kind === "Ingreso").reduce((n, r) => n + r.amountCents, 0);
  const outcome = movements.filter((r) => r.kind === "Egreso").reduce((n, r) => n + r.amountCents, 0);
  const shown = filter === "all" ? movements : movements.filter((r) => r.kind === filter);

  const ratios = [
    { label: "Liquidez", value: s.liabilities > 0 ? (s.receivables + s.banks) / s.liabilities : null, good: 1, warn: 0.5, fmt: (v: number) => v.toFixed(2) },
    { label: "Margen neto", value: s.income > 0 ? s.net / s.income : null, good: 0.1, warn: 0, fmt: (v: number) => `${(v * 100).toFixed(1)} %` },
    { label: "Endeudamiento", value: s.assets > 0 ? s.liabilities / s.assets : null, good: 0.5, warn: 0.7, inverse: true, fmt: (v: number) => `${(v * 100).toFixed(0)} %` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-full overflow-x-auto pb-1">
      <Segmented
        label="Contabilidad"
        value={tab}
        onChange={setTab}
        options={[
          { value: "mov", label: "Movimientos" },
          { value: "res", label: "Estado de resultados" },
          { value: "sit", label: "Situación financiera" },
          { value: "costo", label: "Análisis de costo" },
          { value: "iva", label: "Resumen de IVA" },
        ]}
      />
      </div>

      {tab === "mov" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Kpi label="Ingresos" value={m(income)} />
            <Kpi label="Egresos" value={m(outcome)} />
            <Kpi label="Flujo neto" value={m(income - outcome)} />
          </div>
          <Segmented
            label="Tipo"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Todos" },
              { value: "Ingreso", label: "Ingresos" },
              { value: "Egreso", label: "Egresos" },
            ]}
          />
          <ul className="flex flex-col gap-2">
            {shown.length === 0 && <li className="text-sm text-muted-foreground">Sin movimientos en este periodo.</li>}
            {shown.map((r, i) => (
              <li key={i} className="flex items-center gap-3 rounded-[19px] bg-card p-3 text-sm shadow-(--shadow-card)">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{r.date}</span>
                <span className="min-w-0 flex-1 truncate">
                  {r.label}
                  {r.auto && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">Auto</span>}
                </span>
                <span className={`tabular-nums font-bold ${r.kind === "Ingreso" ? "text-emerald-600" : ""}`}>
                  {r.kind === "Egreso" ? "−" : "+"}
                  {m(r.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "res" && (
        <div className="flex flex-col gap-1 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <Line k="income" label="Ingresos por ventas" v={m(s.income)} help={help} setHelp={setHelp} />
          <Line k="cogs" label="(−) Costo de ventas" v={m(-s.cogs)} help={help} setHelp={setHelp} />
          <Line k="gross" label="Utilidad bruta" v={m(s.gross)} bold help={help} setHelp={setHelp} />
          <Line k="sales" label="(−) Gastos de ventas" v={m(-s.salesExpenses)} help={help} setHelp={setHelp} />
          <Line k="admin" label="(−) Gastos de administración" v={m(-s.adminExpenses)} help={help} setHelp={setHelp} />
          <Line k="operating" label="Resultado de operación" v={m(s.operating)} bold help={help} setHelp={setHelp} />
          <div className="flex items-center gap-2 py-1.5 text-sm">
            <span className="flex-1">(−) ISLR estimado</span>
            <Input aria-label="Tasa de ISLR en %" className="h-8 w-16 text-right" inputMode="numeric" defaultValue={islr} onBlur={(e) => setIslr(e.target.value)} />
            <span className="text-muted-foreground">%</span>
            <button type="button" aria-label="Qué es esto" onClick={() => setHelp(help === "islr" ? null : "islr")} className="size-6 rounded-full bg-muted text-xs font-bold">?</button>
            <span className="w-28 text-right tabular-nums">{m(-s.islr)}</span>
          </div>
          {help === "islr" && <p className="rounded-xl bg-muted p-2.5 text-xs">{HELP.islr}</p>}
          <Line k="net" label="Resultado neto" v={m(s.net)} bold help={help} setHelp={setHelp} />
        </div>
      )}

      {tab === "sit" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card title="Activo corriente" total={m(s.assets)}>
              <Row label="Cuentas por cobrar" v={m(s.receivables)} />
              <Row label="Inventario (a costo)" v={m(s.inventory)} />
              <Row label="Bancos en $" v={m(s.banks)} />
            </Card>
            <Card title="Pasivo corriente" total={m(s.liabilities)}>
              <Row label="Cuentas por pagar" v={m(s.payables)} />
              <Row label="IVA por pagar" v={m(s.ivaPayable)} />
            </Card>
            <Card title="Patrimonio" total={m(s.equity)}>
              <Row label="Activo − pasivo" v={m(s.equity)} />
            </Card>
          </div>
          <p className="rounded-xl bg-muted p-3 text-sm font-bold">
            Activo {m(s.assets)} = Pasivo {m(s.liabilities)} + Patrimonio {m(s.equity)} · Cuadra
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {ratios.map((r) => {
              const v = r.value;
              const color =
                v === null ? "bg-muted" : r.inverse ? (v <= r.good ? "bg-emerald-500" : v <= r.warn ? "bg-amber-500" : "bg-red-500") : v >= r.good ? "bg-emerald-500" : v >= r.warn ? "bg-amber-500" : "bg-red-500";
              return (
                <div key={r.label} className="flex items-center gap-3 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
                  <span className={`size-3.5 rounded-full ${color}`} aria-hidden />
                  <div>
                    <p className="text-xs text-muted-foreground">{r.label}</p>
                    <p className="font-bold tabular-nums">{v === null ? "—" : r.fmt(v)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "costo" && (
        <div className="flex flex-col gap-1 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <Row label="Compras del periodo" v={m(s.purchases)} />
          <Row label="Costo de ventas" v={m(s.cogs)} />
          <Row label="Consumo interno" v={m(s.internalUse)} />
          <Row label="Desviación sin explicar" v={m(s.unexplained)} bold />
          <p className="pt-2 text-xs text-muted-foreground">
            Lo que compraste menos lo que salió por ventas y consumo interno. Si es alto, revisa mermas, conteos o compras que aún no se venden.
          </p>
        </div>
      )}

      {tab === "iva" && (
        <div className="flex flex-col gap-1 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
          <Row label="Base imponible de ventas" v={m(s.salesBase)} />
          <Row label="IVA débito fiscal (ventas)" v={m(s.ivaDebit)} />
          <Row label="Base imponible de compras" v={m(s.purchasesBase)} />
          <Row label="IVA crédito fiscal (compras)" v={m(s.ivaCredit)} />
          <Row label={s.ivaBalance >= 0 ? "IVA a pagar" : "Saldo a favor"} v={m(Math.abs(s.ivaBalance))} bold />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, v, bold }: { label: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-1.5 text-sm ${bold ? "border-t font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

function Card({ title, total, children }: { title: string; total: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[19px] bg-card p-4 shadow-(--shadow-card)">
      <p className="font-bold">{title}</p>
      {children}
      <div className="mt-1 flex justify-between border-t pt-2 font-bold">
        <span>Total</span>
        <span className="tabular-nums">{total}</span>
      </div>
    </div>
  );
}

function Line({
  k,
  label,
  v,
  bold,
  help,
  setHelp,
}: {
  k: string;
  label: string;
  v: string;
  bold?: boolean;
  help: string | null;
  setHelp: (k: string | null) => void;
}) {
  return (
    <>
      <div className={`flex items-center gap-2 py-1.5 text-sm ${bold ? "border-t font-bold" : ""}`}>
        <span className="flex-1">{label}</span>
        <button type="button" aria-label={`Qué es ${label}`} onClick={() => setHelp(help === k ? null : k)} className="size-6 rounded-full bg-muted text-xs font-bold">
          ?
        </button>
        <span className="w-28 text-right tabular-nums">{v}</span>
      </div>
      {help === k && <p className="rounded-xl bg-muted p-2.5 text-xs">{HELP[k]}</p>}
    </>
  );
}
