import "server-only";
import { Prisma } from "@prisma/client";
import type { FullReport, ReportSection } from "@/lib/assistant-types";
import { formatCurrencyCents } from "@/lib/currencies";
import { PAYMENT_METHOD_LABELS } from "@/lib/format";
import { pivotByCurrency, refToLocalCents, sortCurrencyCodes, type Pivot } from "@/lib/currency-breakdown";
import { dayBoundsUtc, SHOP_TIME_ZONE } from "@/lib/report-types";

type Tx = Prisma.TransactionClient;

export type ReportCtx = {
  companyId: string;
  branchId: string | null;
  // Moneda de referencia (EUR/USD) y moneda local (VES), más la tasa de hoy.
  refCurrency: string;
  localCurrency: string;
  rate: number | null;
};

const fmtDay = (d: string) =>
  new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", timeZone: SHOP_TIME_ZONE }).format(new Date(`${d}T12:00:00Z`));
const n = (v: unknown) => Number(v ?? 0);

type PayRow = { key: string; currency: string; cents: bigint; ref: bigint; n: bigint };

// Pivote → tabla con una columna por moneda real (cobrado) y una columna «Equiv. ref.» al final.
function pivotSection(
  title: string,
  keyHeader: string,
  pv: Pivot,
  ctx: ReportCtx,
  opts: { keyLabel?: (k: string) => string; note?: string; extra?: { header: string; values: Map<string, string> } } = {}
): ReportSection {
  const cur = pv.currencies;
  const fmt = (c: string, v: number) => (v ? formatCurrencyCents(c, v) : "—");
  const rows = [...pv.rows].sort((a, b) => b.refCents - a.refCents);
  const tot: Record<string, number> = {};
  let totRef = 0;
  let totN = 0;
  const body = rows.map((r) => {
    totRef += r.refCents;
    totN += r.n;
    for (const c of cur) tot[c] = (tot[c] ?? 0) + (r.cells[c]?.cents ?? 0);
    return [
      opts.keyLabel ? opts.keyLabel(r.key) : r.key,
      String(r.n),
      ...cur.map((c) => fmt(c, r.cells[c]?.cents ?? 0)),
      ...(opts.extra ? [opts.extra.values.get(r.key) ?? "—"] : []),
      formatCurrencyCents(ctx.refCurrency, r.refCents),
    ];
  });
  return {
    title,
    note: opts.note,
    columns: [keyHeader, "Cant.", ...cur.map((c) => `Cobrado en ${c === ctx.localCurrency ? "Bs" : c}`), ...(opts.extra ? [opts.extra.header] : []), `Equiv. ref. (${ctx.refCurrency})`],
    rows: body,
    totals: rows.length
      ? ["Total", String(totN), ...cur.map((c) => fmt(c, tot[c] ?? 0)), ...(opts.extra ? [""] : []), formatCurrencyCents(ctx.refCurrency, totRef)]
      : undefined,
  };
}

export async function buildFullReport(tx: Tx, ctx: ReportCtx, from: string, to: string, companyName: string): Promise<{ report: FullReport; salesCount: number; rows: string[][]; columns: string[]; totals: string[] }> {
  const start = dayBoundsUtc(from).start;
  const end = dayBoundsUtc(to).end;
  const ref = (c: number) => formatCurrencyCents(ctx.refCurrency, c);
  const brS = ctx.branchId ? Prisma.sql`AND s."branchId" = ${ctx.branchId}` : Prisma.empty;
  const cid = ctx.companyId;
  // Moneda real de cada línea: la guardada o, en filas viejas, USD para Zelle/Binance/PayPal y la referencia para el resto.
  const curExpr = Prisma.sql`COALESCE(sp."currencyCode", CASE WHEN sp."paymentMethod"::text IN ('ZELLE','BINANCE','PAYPAL') THEN 'USD' ELSE ${ctx.refCurrency} END)`;
  const payBase = Prisma.sql`FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId"
    WHERE s."companyId" = ${cid} ${brS} AND s."voided" = false AND sp."createdAt" >= ${start} AND sp."createdAt" < ${end}`;
  const toPivot = (rows: PayRow[]) =>
    pivotByCurrency(rows.map((r) => ({ key: r.key, currency: r.currency, cents: n(r.cents), refCents: n(r.ref), n: n(r.n) })), ctx.localCurrency);

  const [sum] = await tx.$queryRaw<{ cnt: bigint; total: bigint; disc: bigint; tax: bigint; igtf: bigint; credit_n: bigint; credit_total: bigint; disc_n: bigint }[]>`
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(s."totalCents"),0)::bigint AS total, COALESCE(SUM(s."discountCents"),0)::bigint AS disc,
           COALESCE(SUM(s."taxCents"),0)::bigint AS tax, COALESCE(SUM(s."igtfCents"),0)::bigint AS igtf,
           COUNT(*) FILTER (WHERE s."paymentStatus" = 'CREDIT')::bigint AS credit_n,
           COALESCE(SUM(s."totalCents") FILTER (WHERE s."paymentStatus" = 'CREDIT'),0)::bigint AS credit_total,
           COUNT(*) FILTER (WHERE s."discountCents" > 0)::bigint AS disc_n
    FROM "Sale" s WHERE s."companyId" = ${cid} ${brS} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}`;
  const [voidRow] = await tx.$queryRaw<{ cnt: bigint; total: bigint }[]>`
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM(s."totalCents"),0)::bigint AS total FROM "Sale" s
    WHERE s."companyId" = ${cid} ${brS} AND s."voided" = true AND s."createdAt" >= ${start} AND s."createdAt" < ${end}`;

  const byCurrencyRows = await tx.$queryRaw<PayRow[]>`
    SELECT 'all' AS key, ${curExpr} AS currency, SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS cents, SUM(sp."amountEurCents")::bigint AS ref, COUNT(*)::bigint AS n
    ${payBase} GROUP BY 2`;
  const byCurrency = toPivot(byCurrencyRows);
  const totalsByCur = new Map(byCurrency.currencies.map((c) => [c, byCurrency.rows[0]?.cells[c] ?? { cents: 0, refCents: 0 }]));
  const collectedRef = byCurrency.rows[0]?.refCents ?? 0;

  const methodPv = toPivot(await tx.$queryRaw<PayRow[]>`
    SELECT sp."paymentMethod"::text AS key, ${curExpr} AS currency, SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS cents, SUM(sp."amountEurCents")::bigint AS ref, COUNT(*)::bigint AS n
    ${payBase} GROUP BY 1, 2`);
  const sellerPv = toPivot(await tx.$queryRaw<PayRow[]>`
    SELECT COALESCE(NULLIF(s."sellerName",''),'Sin vendedor') AS key, ${curExpr} AS currency, SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS cents, SUM(sp."amountEurCents")::bigint AS ref, COUNT(*)::bigint AS n
    ${payBase} GROUP BY 1, 2`);
  const branchPv = toPivot(await tx.$queryRaw<PayRow[]>`
    SELECT b."name" AS key, ${curExpr} AS currency, SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS cents, SUM(sp."amountEurCents")::bigint AS ref, COUNT(*)::bigint AS n
    FROM "SalePayment" sp JOIN "Sale" s ON s.id = sp."saleId" JOIN "Branch" b ON b.id = s."branchId"
    WHERE s."companyId" = ${cid} ${brS} AND s."voided" = false AND sp."createdAt" >= ${start} AND sp."createdAt" < ${end} GROUP BY 1, 2`);
  const dayPv = toPivot(await tx.$queryRaw<PayRow[]>`
    SELECT to_char(sp."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE}, 'YYYY-MM-DD') AS key, ${curExpr} AS currency, SUM(COALESCE(sp."amountCurrencyCents", sp."amountEurCents"))::bigint AS cents, SUM(sp."amountEurCents")::bigint AS ref, COUNT(*)::bigint AS n
    ${payBase} GROUP BY 1, 2`);

  // Ventas por día (fecha de la venta) para unir con lo cobrado ese día.
  const salesDay = await tx.$queryRaw<{ day: string; cnt: bigint; total: bigint; disc: bigint }[]>`
    SELECT to_char(s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE}, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS cnt, SUM(s."totalCents")::bigint AS total, SUM(s."discountCents")::bigint AS disc
    FROM "Sale" s WHERE s."companyId" = ${cid} ${brS} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end} GROUP BY 1 ORDER BY 1`;

  const prodRows = await tx.$queryRaw<{ name: string; cat: string | null; qty: bigint; total: bigint; cogs: bigint }[]>`
    SELECT si."productName" AS name, si."category" AS cat, SUM(si."quantity")::float8 AS qty, SUM(si."subtotalCents")::bigint AS total,
           COALESCE(SUM(si."quantity" * p."costCents"),0)::bigint AS cogs
    FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" LEFT JOIN "Product" p ON p.id = si."productId"
    WHERE s."companyId" = ${cid} ${brS} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
    GROUP BY 1, 2 ORDER BY total DESC`;
  const catRows = await tx.$queryRaw<{ cat: string; qty: bigint; total: bigint; cogs: bigint }[]>`
    SELECT COALESCE(NULLIF(si."category",''),'Sin categoría') AS cat, SUM(si."quantity")::float8 AS qty, SUM(si."subtotalCents")::bigint AS total,
           COALESCE(SUM(si."quantity" * p."costCents"),0)::bigint AS cogs
    FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" LEFT JOIN "Product" p ON p.id = si."productId"
    WHERE s."companyId" = ${cid} ${brS} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
    GROUP BY 1 ORDER BY total DESC`;
  const [cogsRow] = await tx.$queryRaw<{ cogs: bigint; costed: bigint }[]>`
    SELECT COALESCE(SUM(si."quantity" * p."costCents"),0)::bigint AS cogs,
           COALESCE(SUM(si."subtotalCents") FILTER (WHERE p."costCents" IS NOT NULL),0)::bigint AS costed
    FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId" LEFT JOIN "Product" p ON p.id = si."productId"
    WHERE s."companyId" = ${cid} ${brS} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}`;

  const discBySeller = await tx.$queryRaw<{ k: string; cnt: bigint; disc: bigint; gross: bigint }[]>`
    SELECT COALESCE(NULLIF(s."sellerName",''),'Sin vendedor') AS k, COUNT(*)::bigint AS cnt, SUM(s."discountCents")::bigint AS disc, SUM(s."totalCents" + s."discountCents")::bigint AS gross
    FROM "Sale" s WHERE s."companyId" = ${cid} ${brS} AND s."voided" = false AND s."discountCents" > 0 AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
    GROUP BY 1 ORDER BY disc DESC LIMIT 10`;

  // Por cobrar (a hoy): saldo = total − abonos.
  const debtors = await tx.$queryRaw<{ cust: string; cnt: bigint; total: bigint; paid: bigint; oldest: Date }[]>`
    SELECT COALESCE(NULLIF(TRIM(COALESCE(s."customerFirstName",'') || ' ' || COALESCE(s."customerLastName",'')),''),'Sin nombre') AS cust,
           COUNT(*)::bigint AS cnt, SUM(s."totalCents")::bigint AS total,
           COALESCE(SUM((SELECT SUM(sp."amountEurCents") FROM "SalePayment" sp WHERE sp."saleId" = s.id)),0)::bigint AS paid, MIN(s."createdAt") AS oldest
    FROM "Sale" s WHERE s."companyId" = ${cid} ${brS} AND s."paymentStatus" = 'CREDIT' AND s."voided" = false GROUP BY 1`;
  const openDebt = debtors.map((d) => ({ ...d, left: n(d.total) - n(d.paid) })).filter((d) => d.left > 0).sort((a, b) => b.left - a.left);
  const debtTotal = openDebt.reduce((a, d) => a + d.left, 0);

  // Gastos: lo tecleado en Bs queda en Bs; el resto en la divisa de referencia.
  const expRows = await tx.$queryRaw<{ cat: string; cnt: bigint; local: bigint; foreign: bigint; ref: bigint }[]>`
    SELECT COALESCE(NULLIF("category",''),'Otros') AS cat, COUNT(*)::bigint AS cnt,
           COALESCE(SUM("localAmountCents") FILTER (WHERE "enteredInLocal"),0)::bigint AS local,
           COALESCE(SUM("amountCents") FILTER (WHERE NOT "enteredInLocal"),0)::bigint AS foreign,
           SUM("amountCents")::bigint AS ref
    FROM "Expense" WHERE "companyId" = ${cid} ${ctx.branchId ? Prisma.sql`AND ("branchId" = ${ctx.branchId} OR "branchId" IS NULL)` : Prisma.empty}
      AND "spentAt" >= ${start} AND "spentAt" < ${end} GROUP BY 1 ORDER BY ref DESC`;
  const expTotal = expRows.reduce((a, r) => a + n(r.ref), 0);

  // Compras: lo pagado por moneda real y lo que queda por pagar.
  const purchSum = await tx.$queryRaw<{ cnt: bigint; total: bigint; pending: bigint }[]>`
    SELECT COUNT(*)::bigint AS cnt, COALESCE(SUM("totalCents"),0)::bigint AS total,
           COALESCE(SUM("totalCents") FILTER (WHERE "paymentStatus" = 'PENDING'),0)::bigint AS pending
    FROM "Purchase" WHERE "companyId" = ${cid} ${ctx.branchId ? Prisma.sql`AND "branchId" = ${ctx.branchId}` : Prisma.empty} AND "voided" = false AND "createdAt" >= ${start} AND "createdAt" < ${end}`;
  const purchPay = await tx.$queryRaw<PayRow[]>`
    SELECT 'all' AS key, COALESCE(pp."currencyCode", CASE WHEN pp."paymentMethod"::text IN ('ZELLE','BINANCE','PAYPAL') THEN 'USD' ELSE ${ctx.refCurrency} END) AS currency,
           SUM(COALESCE(pp."amountCurrencyCents", pp."amountEurCents"))::bigint AS cents, SUM(pp."amountEurCents")::bigint AS ref, COUNT(*)::bigint AS n
    FROM "PurchasePayment" pp JOIN "Purchase" pu ON pu.id = pp."purchaseId"
    WHERE pu."companyId" = ${cid} ${ctx.branchId ? Prisma.sql`AND pu."branchId" = ${ctx.branchId}` : Prisma.empty} AND pu."voided" = false AND pp."createdAt" >= ${start} AND pp."createdAt" < ${end} GROUP BY 2`;
  const purchTop = await tx.$queryRaw<{ sup: string; cnt: bigint; total: bigint }[]>`
    SELECT COALESCE(sup."name", pu."manualSupplierName", 'Sin proveedor') AS sup, COUNT(*)::bigint AS cnt, SUM(pu."totalCents")::bigint AS total
    FROM "Purchase" pu LEFT JOIN "Supplier" sup ON sup.id = pu."supplierId"
    WHERE pu."companyId" = ${cid} ${ctx.branchId ? Prisma.sql`AND pu."branchId" = ${ctx.branchId}` : Prisma.empty} AND pu."voided" = false AND pu."createdAt" >= ${start} AND pu."createdAt" < ${end}
    GROUP BY 1 ORDER BY total DESC LIMIT 8`;
  const purchPv = toPivot(purchPay);

  const count = n(sum?.cnt);
  const total = n(sum?.total);
  const cogs = n(cogsRow?.cogs);
  const costedRev = n(cogsRow?.costed);
  const grossProfit = costedRev - cogs;
  const netProfit = grossProfit - expTotal;
  const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1).replace(".", ",")} %` : "—");
  const localLbl = (c: string) => (c === ctx.localCurrency ? "Bs" : c);

  const kpis = [
    { label: "Ventas realizadas", value: String(count), hint: `${n(voidRow?.cnt)} anulada(s) no incluidas` },
    ...[...totalsByCur.entries()].map(([c, v]) => ({ label: `Cobrado en ${localLbl(c)}`, value: formatCurrencyCents(c, v.cents), hint: `${ref(v.refCents)} de referencia` })),
    { label: "Valor vendido (referencia)", value: ref(total), hint: "A la tasa BCV; solo referencia" },
    { label: "Ticket promedio (ref.)", value: count ? ref(Math.round(total / count)) : "—" },
    { label: "Descuentos otorgados (ref.)", value: ref(n(sum?.disc)), hint: `${n(sum?.disc_n)} venta(s) con descuento` },
    { label: "Ventas a crédito del período (ref.)", value: ref(n(sum?.credit_total)), hint: `${n(sum?.credit_n)} venta(s)` },
    { label: "Por cobrar hoy (ref.)", value: ref(debtTotal), hint: ctx.rate ? `≈ ${formatCurrencyCents(ctx.localCurrency, refToLocalCents(debtTotal, ctx.rate) ?? 0)} a la tasa de hoy` : undefined },
    { label: "Gastos del período (ref.)", value: ref(expTotal) },
    { label: "Compras del período (ref.)", value: ref(n(purchSum[0]?.total)), hint: `${n(purchSum[0]?.cnt)} compra(s)` },
    { label: "Ganancia bruta (ref.)", value: ref(grossProfit), hint: `Margen ${pct(grossProfit, costedRev)}` },
    { label: "Ganancia neta estimada (ref.)", value: ref(netProfit), hint: "Ganancia bruta − gastos" },
  ];

  const sections: ReportSection[] = [];

  // 1. Cobrado por moneda
  sections.push({
    title: "1. Cobrado por moneda",
    note: "Lo que realmente entró a caja y cuentas en cada moneda. La referencia es solo informativa.",
    columns: ["Moneda", "Pagos", "Monto cobrado", `Equiv. ref. (${ctx.refCurrency})`],
    rows: [...totalsByCur.entries()].map(([c, v]) => [c === ctx.localCurrency ? `Bolívares (${c})` : c, String(byCurrencyRows.find((r) => r.currency === c)?.n ?? 0), formatCurrencyCents(c, v.cents), ref(v.refCents)]),
    totals: ["Consolidado (referencia)", "", "", ref(collectedRef)],
  });

  // 2. Método de pago
  sections.push(pivotSection("2. Cobrado por método de pago", "Método", methodPv, ctx, { keyLabel: (k) => PAYMENT_METHOD_LABELS[k as keyof typeof PAYMENT_METHOD_LABELS] ?? k }));

  // 3. Por día
  const sdMap = new Map(salesDay.map((r) => [r.day, r]));
  const allDays = [...new Set([...sdMap.keys(), ...dayPv.rows.map((r) => r.key)])].sort();
  const dcur = dayPv.currencies;
  const dayTot: Record<string, number> = {};
  sections.push({
    title: "3. Detalle por día",
    note: "Ventas y valor vendido por fecha de la venta; cobrado por fecha en que se recibió cada pago.",
    columns: ["Fecha", "Ventas", "Vendido (ref.)", ...dcur.map((c) => `Cobrado ${localLbl(c)}`)],
    rows: allDays.map((d) => {
      const s = sdMap.get(d);
      const p = dayPv.rows.find((r) => r.key === d);
      for (const c of dcur) dayTot[c] = (dayTot[c] ?? 0) + (p?.cells[c]?.cents ?? 0);
      return [fmtDay(d), String(n(s?.cnt)), ref(n(s?.total)), ...dcur.map((c) => (p?.cells[c]?.cents ? formatCurrencyCents(c, p.cells[c].cents) : "—"))];
    }),
    totals: allDays.length ? ["Total", String(count), ref(total), ...dcur.map((c) => (dayTot[c] ? formatCurrencyCents(c, dayTot[c]) : "—"))] : undefined,
  });

  // 4. Productos (valor vendido en referencia: los precios se fijan a la tasa BCV)
  const prodRow = (r: (typeof prodRows)[number]) => [r.name, r.cat ?? "—", String(n(r.qty)), ref(n(r.total)), n(r.cogs) ? pct(n(r.total) - n(r.cogs), n(r.total)) : "—"];
  sections.push({
    title: "4. Productos más vendidos (Top 10)",
    note: "Valor vendido en moneda de referencia (los precios se fijan a la tasa BCV); el margen usa el costo del producto.",
    columns: ["Producto", "Categoría", "Unid.", "Vendido (ref.)", "Margen"],
    rows: prodRows.slice(0, 10).map(prodRow),
  });
  const bottom = [...prodRows].sort((a, b) => n(a.total) - n(b.total)).slice(0, 10);
  if (prodRows.length > 10) {
    sections.push({ title: "5. Productos de menor venta (Bottom 10)", columns: ["Producto", "Categoría", "Unid.", "Vendido (ref.)", "Margen"], rows: bottom.map(prodRow) });
  }
  sections.push({
    title: "6. Ventas por categoría",
    columns: ["Categoría", "Unid.", "Vendido (ref.)", "% del total", "Margen"],
    rows: catRows.map((r) => [r.cat, String(n(r.qty)), ref(n(r.total)), pct(n(r.total), catRows.reduce((a, x) => a + n(x.total), 0)), n(r.cogs) ? pct(n(r.total) - n(r.cogs), n(r.total)) : "—"]),
  });

  // 7. Vendedor / cajero y sede
  sections.push(pivotSection("7. Cobrado por vendedor / cajero", "Vendedor", sellerPv, ctx));
  if (branchPv.rows.length > 1) sections.push(pivotSection("8. Cobrado por sede", "Sede", branchPv, ctx));

  // 9. Descuentos
  sections.push({
    title: "9. Descuentos",
    note: `${n(sum?.disc_n)} venta(s) con descuento por ${ref(n(sum?.disc))} (referencia).`,
    columns: ["Vendedor", "Ventas", "Descuento (ref.)", "% sobre bruto"],
    rows: discBySeller.map((r) => [r.k, String(n(r.cnt)), ref(n(r.disc)), pct(n(r.disc), n(r.gross))]),
  });

  // 10. Crédito / por cobrar
  sections.push({
    title: "10. Ventas a crédito y cuentas por cobrar",
    note: `Saldo por cobrar a hoy: ${ref(debtTotal)} (referencia)${ctx.rate ? `, equivalente a ${formatCurrencyCents(ctx.localCurrency, refToLocalCents(debtTotal, ctx.rate) ?? 0)} a la tasa de hoy` : ""}. El cobro se registra en la moneda en que pague el cliente.`,
    columns: ["Cliente", "Facturas", "Saldo (ref.)", ctx.rate ? "Equiv. Bs hoy" : "—", "Más antigua"],
    rows: openDebt.slice(0, 15).map((d) => [d.cust, String(n(d.cnt)), ref(d.left), ctx.rate ? formatCurrencyCents(ctx.localCurrency, refToLocalCents(d.left, ctx.rate) ?? 0) : "—", fmtDay(new Date(d.oldest).toISOString().slice(0, 10))]),
    totals: openDebt.length ? ["Total", String(openDebt.reduce((a, d) => a + n(d.cnt), 0)), ref(debtTotal), ctx.rate ? formatCurrencyCents(ctx.localCurrency, refToLocalCents(debtTotal, ctx.rate) ?? 0) : "—", ""] : undefined,
  });

  // 11. Gastos
  sections.push({
    title: "11. Gastos por categoría",
    note: "Los gastos registrados en bolívares se muestran en Bs; los demás en la divisa de referencia.",
    columns: ["Categoría", "Cant.", "Pagado en Bs", `Pagado en ${ctx.refCurrency}`, `Total (ref. ${ctx.refCurrency})`],
    rows: expRows.map((r) => [r.cat, String(n(r.cnt)), n(r.local) ? formatCurrencyCents(ctx.localCurrency, n(r.local)) : "—", n(r.foreign) ? ref(n(r.foreign)) : "—", ref(n(r.ref))]),
    totals: expRows.length
      ? ["Total", String(expRows.reduce((a, r) => a + n(r.cnt), 0)), formatCurrencyCents(ctx.localCurrency, expRows.reduce((a, r) => a + n(r.local), 0)), ref(expRows.reduce((a, r) => a + n(r.foreign), 0)), ref(expTotal)]
      : undefined,
  });

  // 12. Compras
  if (n(purchSum[0]?.cnt) > 0) {
    sections.push({
      title: "12. Compras a proveedores",
      note: `Pagado en el período: ${purchPv.rows[0] ? purchPv.currencies.map((c) => formatCurrencyCents(c, purchPv.rows[0].cells[c]?.cents ?? 0)).join(" + ") : "—"}. Por pagar de estas compras: ${ref(n(purchSum[0]?.pending))} (ref.).`,
      columns: ["Proveedor", "Compras", "Total (ref.)"],
      rows: purchTop.map((r) => [r.sup, String(n(r.cnt)), ref(n(r.total))]),
      totals: ["Total", String(n(purchSum[0]?.cnt)), ref(n(purchSum[0]?.total))],
    });
  }

  // 13. Ganancia
  sections.push({
    title: "13. Ganancia y margen (estimado)",
    columns: ["Concepto", "Monto (ref.)"],
    rows: [
      ["Valor vendido con costo conocido", ref(costedRev)],
      ["Costo de lo vendido", ref(cogs)],
      ["Ganancia bruta", ref(grossProfit)],
      ["Margen bruto", pct(grossProfit, costedRev)],
      ["Gastos del período", ref(expTotal)],
      ["Ganancia neta estimada", ref(netProfit)],
    ],
  });

  const notes = [
    "Moneda de trabajo: cada cobro y pago se muestra en la moneda real en que se recibió (Bs en bolívares, $ y € en divisas). Las columnas «ref.» son conversiones de referencia a la tasa BCV y no representan dinero recibido.",
    ctx.rate ? `Tasa de referencia de hoy: ${ctx.rate.toFixed(2).replace(".", ",")} ${ctx.localCurrency} por ${ctx.refCurrency}.` : "No hay tasa de cambio configurada.",
    "Las ventas anuladas no se incluyen. Los cobros se cuentan en la fecha en que se recibió cada pago (un abono a crédito cuenta el día que se cobra).",
    "La ganancia se calcula con el costo registrado de cada producto; los productos sin costo no entran al margen.",
    `Reporte de ${companyName} del ${fmtDay(from)} al ${fmtDay(to)}.`,
  ];

  // Resumen para la vista en el chat: por día con columnas por moneda.
  const rowsUi = allDays.map((d) => {
    const s = sdMap.get(d);
    const p = dayPv.rows.find((r) => r.key === d);
    return [fmtDay(d), String(n(s?.cnt)), ...dcur.map((c) => (p?.cells[c]?.cents ? formatCurrencyCents(c, p.cells[c].cents) : "—")), ref(n(s?.total))];
  });
  void sortCurrencyCodes;
  return {
    report: { kpis, sections, notes },
    salesCount: count,
    columns: ["Fecha", "Ventas", ...dcur.map((c) => `Cobrado ${localLbl(c)}`), "Vendido (ref.)"],
    rows: rowsUi,
    totals: ["Total", String(count), ...dcur.map((c) => (dayTot[c] ? formatCurrencyCents(c, dayTot[c]) : "—")), ref(total)],
  };
}
