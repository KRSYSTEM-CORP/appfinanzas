import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoxesIcon,
  ClipboardListIcon,
  FileTextIcon,
  HandCoinsIcon,
  PackageIcon,
  ShoppingCartIcon,
  WalletIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangeSwitcher } from "@/components/shared/DateRangeSwitcher";
import { getExchangeRateInfo } from "@/lib/actions/settings";
import { receivablesTotals, revenueTotals, topProducts } from "@/lib/actions/reports";
import { commissionsTotal } from "@/lib/actions/seller-reports";
import { costOfGoodsSold, expensesTotal, getProfitGoal } from "@/lib/actions/finance";
import { getDashboardTasks } from "@/lib/actions/dashboard";
import { latestSales, salesByHourToday } from "@/lib/actions/home";
import { parseDateRangeSelection, SHOP_TIME_ZONE, type DateRangeSelection } from "@/lib/report-types";
import { requireManager } from "@/lib/session";
import { formatCurrencyCents, formatLocalCurrency } from "@/lib/currencies";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { PaymentMethod } from "@prisma/client";

export const dynamic = "force-dynamic";

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function periodLabel(range: DateRangeSelection): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const [y, m, d] = parts;
  if (range.kind === "months") return `${range.months.length} ${range.months.length === 1 ? "mes" : "meses"} de ${range.year}`;
  if (range.kind === "range") return `Del ${range.from} al ${range.to}`;
  if (range.preset === "today") return "Hoy";
  if (range.preset === "7d") return "Últimos 7 días";
  const name = MONTH_NAMES[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} · día ${d} de ${new Date(y, m, 0).getDate()}`;
}

function Shortcut({ href, icon: Icon, title, sub, tone }: { href: string; icon: React.ComponentType<{ className?: string }>; title: string; sub: string; tone: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-(--shadow-card) transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.98]"
    >
      <span style={{ "--mc": tone } as React.CSSProperties} className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--mc)_14%,transparent)] text-[var(--mc)]">
        <Icon className="size-5" />
      </span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
    </Link>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card/80 px-3 py-1.5 shadow-xs">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function ActionRow({ tone, text, href, cta }: { tone: "warn" | "bad" | "info"; text: string; href: string; cta: string }) {
  const dot = tone === "warn" ? "bg-warning" : tone === "bad" ? "bg-destructive" : "bg-primary";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      <Button size="sm" variant="secondary" nativeButton={false} render={<Link href={href} />}>
        {cta}
      </Button>
    </li>
  );
}

export default async function BusinessHome({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; year?: string; months?: string; from?: string; to?: string }>;
}) {
  const session = await requireManager();
  const range = parseDateRangeSelection(await searchParams, { kind: "preset", preset: "month" });
  const [{ rate, localCurrencyCode, exchangeRateEnabled, referenceCurrency }, totals, cogsCents, expensesCents, commissionsCents, receivables, bestSellers, tasks, hours, latest, goalCents] =
    await Promise.all([
      getExchangeRateInfo(),
      revenueTotals(range),
      costOfGoodsSold(range),
      expensesTotal(range),
      commissionsTotal(range),
      receivablesTotals(),
      topProducts(range, 5),
      getDashboardTasks(),
      salesByHourToday(),
      latestSales(5),
      getProfitGoal(),
    ]);

  const money = (c: number) => formatCurrencyCents(referenceCurrency, c);
  const revenue = totals.totalEurCents;
  const profit = revenue - cogsCents - expensesCents - commissionsCents;
  const marginPct = revenue > 0 ? Math.round(((profit / revenue) * 1000)) / 10 : 0;
  const profitInLocal = exchangeRateEnabled && rate ? formatLocalCurrency(Math.round((profit / 100) * rate * 100) / 100, localCurrencyCode) : null;
  const peak = hours.reduce<(typeof hours)[number] | null>((best, h) => (best == null || h.count > best.count ? h : best), null);
  const maxCount = Math.max(1, ...hours.map((h) => h.count));

  const now = new Date();
  const eyebrow = `${new Intl.DateTimeFormat("es-VE", { timeZone: SHOP_TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(now)} · ${session.branchName ?? "Todas las sedes"}`.toUpperCase();

  const actions: { tone: "warn" | "bad" | "info"; text: string; href: string; cta: string }[] = [];
  if (tasks.lowStock.count > 0) {
    const names = tasks.lowStock.products.map((p) => `${p.name} tiene ${p.stock}`).join("; ");
    actions.push({ tone: "warn", text: `${tasks.lowStock.count} ${tasks.lowStock.count === 1 ? "producto con stock bajo" : "productos con stock bajo"}: ${names}.`, href: "/inventory", cta: "Ver inventario" });
  }
  if (receivables.count > 0) {
    actions.push({ tone: "warn", text: `${receivables.count} ${receivables.count === 1 ? "venta" : "ventas"} a crédito por cobrar (${money(receivables.totalEurCents)}).`, href: "/accounting/receivables", cta: "Ver cuentas" });
  }
  if (tasks.pendingQuotes > 0) {
    actions.push({ tone: "info", text: `${tasks.pendingQuotes} ${tasks.pendingQuotes === 1 ? "presupuesto espera" : "presupuestos esperan"} respuesta del cliente.`, href: "/quotes/history", cta: "Dar seguimiento" });
  }
  if (tasks.pendingClosingCount > 0) {
    actions.push({ tone: "bad", text: `${tasks.pendingClosingCount} ${tasks.pendingClosingCount === 1 ? "día" : "días"} con ventas sin cierre de caja.`, href: "/reports", cta: "Cerrar caja" });
  }

  // Meta de ganancia del mes (se define en Estadísticas). Proyección solo en «Mes».
  const goalPct = goalCents && goalCents > 0 ? Math.min(100, Math.max(0, Math.round((profit / goalCents) * 100))) : null;
  let projection: number | null = null;
  if (goalCents && range.kind === "preset" && range.preset === "month") {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
    const [y, m, d] = parts;
    projection = Math.round((profit / d) * new Date(y, m, 0).getDate());
  }

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">Inicio</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeSwitcher selection={range} />
          <span className="rounded-full bg-card px-3 py-1.5 text-sm font-semibold shadow-(--shadow-card)">{periodLabel(range)}</span>
        </div>
      </header>

      <section
        aria-label="Ganancia neta estimada"
        className={`rounded-3xl p-5 md:p-6 ${profit >= 0 ? "bg-success/14" : "bg-destructive/12"}`}
      >
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Ganancia neta estimada</p>
        <p className={`mt-1 text-5xl font-extrabold tracking-tight tabular-nums md:text-6xl ${profit >= 0 ? "text-success" : "text-destructive"}`}>{money(profit)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {profitInLocal ? `${profitInLocal} · ` : ""}
          {marginPct} % de margen · {periodLabel(range)}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Chip label="Ventas" value={money(revenue)} />
          <span aria-hidden className="text-muted-foreground">−</span>
          <Chip label="Costo" value={money(cogsCents)} />
          <span aria-hidden className="text-muted-foreground">−</span>
          <Chip label="Gastos" value={money(expensesCents)} />
          <span aria-hidden className="text-muted-foreground">−</span>
          <Chip label="Comisiones" value={money(commissionsCents)} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Calculada con los días que ya tienen cierre de caja.</p>
      </section>

      <section aria-label="Accesos rápidos" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Shortcut href="/pos" icon={ShoppingCartIcon} title="Vender" sub="POS" tone="#0f9d9a" />
        <Shortcut href="/quotes" icon={ClipboardListIcon} title="Presupuesto" sub="Nuevo" tone="#7a3ff2" />
        <Shortcut href="/accounting/receivables" icon={HandCoinsIcon} title="Cuentas por cobrar" sub={`${money(receivables.totalEurCents)} por cobrar`} tone="#d6407f" />
        <Shortcut href="/reports" icon={WalletIcon} title="Caja Chica" sub={tasks.pendingClosingCount > 0 ? `${tasks.pendingClosingCount} por cerrar` : "Al día"} tone="#1f8a3c" />
        <Shortcut href="/inventory" icon={PackageIcon} title="Inventario" sub={tasks.lowStock.count > 0 ? `${tasks.lowStock.count} ${tasks.lowStock.count === 1 ? "alerta" : "alertas"}` : "Sin alertas"} tone="#ff9f0a" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Lo que no puede esperar</CardTitle>
          <p className="text-sm text-muted-foreground">Avisos que necesitan una acción hoy</p>
        </CardHeader>
        <CardContent>
          {actions.length === 0 ? (
            <p className="rounded-xl bg-success/10 p-4 text-sm text-success">No hay pendientes ahora: inventario en nivel, sin presupuestos por seguir ni cierres atrasados.</p>
          ) : (
            <ul className="divide-y">
              {actions.map((a) => (
                <ActionRow key={a.href} {...a} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ventas por hora</CardTitle>
            <p className="text-sm text-muted-foreground">
              {hours.length === 0 || !peak ? "Hoy · aún no hay ventas" : `Hoy · el pico es entre las ${peak.hour} y las ${peak.hour + 1} h`}
            </p>
          </CardHeader>
          <CardContent>
            {hours.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Cuando registres ventas hoy, las verás por hora aquí.</p>
            ) : (
              <div className="flex h-36 items-end gap-1.5" role="img" aria-label="Ventas de hoy por hora">
                {Array.from({ length: Math.max(...hours.map((h) => h.hour)) - Math.min(...hours.map((h) => h.hour)) + 1 }, (_, i) => Math.min(...hours.map((h) => h.hour)) + i).map((h) => {
                  const p = hours.find((x) => x.hour === h);
                  const pct = p ? Math.max(8, Math.round((p.count / maxCount) * 100)) : 4;
                  return (
                    <div key={h} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                      <div className={`w-full rounded-t-md ${p ? "bg-primary" : "bg-muted"}`} style={{ height: `${pct}%` }} title={p ? `${p.count} ventas` : "Sin ventas"} />
                      <span className="text-[10px] text-muted-foreground tabular-nums">{h}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meta de ganancia</CardTitle>
            <p className="text-sm text-muted-foreground">{goalCents ? periodLabel(range) : "Todavía no definiste una meta"}</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {goalCents && goalPct != null ? (
              <>
                <p className="text-sm">
                  Vas <b className="tabular-nums">{money(profit)}</b> de <b className="tabular-nums">{money(goalCents)}</b>
                </p>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Avance de la meta" aria-valuenow={goalPct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {goalPct} % · {profit >= goalCents ? "¡Meta cumplida!" : `Faltan ${money(goalCents - profit)}`}
                  {projection != null ? `. A este ritmo cierras el mes en ${money(projection)}.` : ""}
                </p>
              </>
            ) : (
              <Button variant="secondary" size="sm" className="w-fit" nativeButton={false} render={<Link href="/finance" />}>
                Definir meta en Estadísticas <ArrowRightIcon data-icon="inline-end" />
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Lo más vendido</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{periodLabel(range)}</p>
            </div>
            <BoxesIcon className="size-5 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            {bestSellers.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay ventas cerradas en este período.</p>
            ) : (
              <ol className="divide-y">
                {bestSellers.map((p) => (
                  <li key={`${p.productId ?? p.productName}-${p.category ?? ""}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0 truncate font-medium">{p.productName}</span>
                    <span className="shrink-0 font-bold tabular-nums">{money(p.revenueCents)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Últimas ventas</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">Bolívares en Bs, divisas en $ con referencia</p>
            </div>
            <FileTextIcon className="size-5 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            {latest.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay ventas.</p>
            ) : (
              <ul className="divide-y">
                {latest.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {s.number ? `#${s.number} · ` : ""}
                        {s.customer}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {s.methods.map((m) => PAYMENT_METHOD_LABELS[m as PaymentMethod] ?? m).join(" + ") || "—"}
                        {s.onCredit ? " · a crédito" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">{money(s.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {!actions.length ? null : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangleIcon className="size-3.5" aria-hidden /> Los pendientes se actualizan al entrar a esta pantalla.
        </p>
      )}
    </div>
  );
}
