import "server-only";
import { Prisma } from "@prisma/client";
import type { Proposal, BlockSpec } from "@/lib/assistant";
import {
  ASSISTANT_LINKS,
  DATASET_LABELS,
  type DatasetId,
  type ResolvedBlock,
  type ResolvedTable,
  type SalePreview,
} from "@/lib/assistant-types";
import { formatCurrencyCents, eurCentsToLocal } from "@/lib/currencies";
import { computeItemDiscountCents } from "@/lib/discount";
import { resolveTierPrice } from "@/lib/pricing";
import { buildFullReport } from "@/lib/assistant-report-data";
import { dayBoundsUtc, SHOP_TIME_ZONE, todayDateString } from "@/lib/report-types";

// Los datos que muestra el Asistente salen SIEMPRE de la base de datos (nunca del modelo):
// el modelo solo pide qué mostrar y el servidor consulta, formatea y devuelve.

type Tx = Prisma.TransactionClient;
export type DataCtx = { companyId: string; branchId: string | null; currency: string };

const monthStart = (today: string) => `${today.slice(0, 7)}-01`;
const fmtDate = (d: Date | string) => {
  const date = typeof d === "string" ? new Date(`${d}T12:00:00Z`) : d;
  return new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", timeZone: SHOP_TIME_ZONE }).format(date);
};

export async function resolveBlocks(tx: Tx, ctx: DataCtx, specs: BlockSpec[]): Promise<ResolvedBlock[]> {
  const out: ResolvedBlock[] = [];
  for (const spec of specs.slice(0, 4)) {
    try {
      if (spec.type === "link") {
        out.push({ type: "link", label: `Abrir ${spec.to.replace(/_/g, " ")}`, href: ASSISTANT_LINKS[spec.to] });
      } else if (spec.type === "products") {
        const p = await searchProducts(tx, ctx, spec.query);
        if (p.items.length) out.push(p);
      } else if (spec.type === "table") {
        out.push((await dataset(tx, ctx, spec.dataset, spec.from, spec.to)).table);
      } else {
        const t = await dataset(tx, ctx, spec.dataset, spec.from, spec.to, true);
        if (t.chartPoints?.length) {
          out.push({ type: "chart", dataset: spec.dataset, title: t.table.title, kind: spec.kind, points: t.chartPoints });
        }
      }
    } catch (e) {
      console.error("[asistente] bloque falló", spec.type, e instanceof Error ? e.message : e);
    }
  }
  return out;
}

async function searchProducts(tx: Tx, ctx: DataCtx, query: string): Promise<Extract<ResolvedBlock, { type: "products" }>> {
  const tokens = query.split(/\s+/).filter((t) => t.length >= 2).slice(0, 4);
  const rows = tokens.length
    ? await tx.$queryRaw<{ id: string; name: string; category: string | null; priceCents: number; stock: number; trackStock: boolean; has_image: boolean; updatedAt: Date }[]>`
        SELECT id, "name", "category", "priceCents", "stock", "trackStock", ("imageDataUrl" IS NOT NULL) AS has_image, "updatedAt"
        FROM "Product"
        WHERE "companyId" = ${ctx.companyId} ${ctx.branchId ? Prisma.sql`AND "branchId" = ${ctx.branchId}` : Prisma.empty}
          AND "isActive" = true
          AND (${Prisma.join(tokens.map((t) => Prisma.sql`("name" ILIKE ${"%" + t + "%"} OR COALESCE("category",'') ILIKE ${"%" + t + "%"})`), " OR ")})
        ORDER BY "name" ASC LIMIT 6`
    : [];
  return {
    type: "products",
    title: `Productos: ${query}`,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      price: formatCurrencyCents(ctx.currency, r.priceCents),
      stock: r.trackStock ? `${r.stock} en stock` : "Sin control de stock",
      imageUrl: r.has_image ? `/api/products/${r.id}/image?v=${new Date(r.updatedAt).getTime()}` : null,
    })),
  };
}

type DatasetResult = { table: ResolvedTable; chartPoints?: { label: string; value: number; display: string }[] };

export async function dataset(tx: Tx, ctx: DataCtx, id: DatasetId, fromIn?: string, toIn?: string, _chart = false): Promise<DatasetResult & ResolvedTable> {
  void _chart;
  const today = todayDateString();
  const from = fromIn && fromIn <= today ? fromIn : monthStart(today);
  const to = toIn && toIn >= from ? (toIn > today ? today : toIn) : today;
  const start = dayBoundsUtc(from).start;
  const end = dayBoundsUtc(to).end;
  const br = ctx.branchId ? Prisma.sql`AND s."branchId" = ${ctx.branchId}` : Prisma.empty;
  const m = (c: number) => formatCurrencyCents(ctx.currency, c);
  const period = `${fmtDate(from)} al ${fmtDate(to)}`;
  const base = { type: "table" as const, dataset: id, title: DATASET_LABELS[id], from, to };
  let table: ResolvedTable;
  let chartPoints: DatasetResult["chartPoints"];
  const comp = await tx.company.findUnique({ where: { id: ctx.companyId }, select: { name: true, localCurrencyCode: true, exchangeRate: true, exchangeRateEnabled: true } });
  const rate = comp?.exchangeRateEnabled && comp.exchangeRate ? Number(comp.exchangeRate) : null;
  const refTag = `(ref. ${ctx.currency})`;

  if (id === "reporte_completo") {
    const full = await buildFullReport(tx, { companyId: ctx.companyId, branchId: ctx.branchId, refCurrency: ctx.currency, localCurrency: comp?.localCurrencyCode ?? "VES", rate }, from, to, comp?.name ?? "la empresa");
    table = { ...base, subtitle: `${period} · ${full.salesCount} venta(s) · cobrado por moneda`, columns: full.columns, rows: full.rows, totals: full.totals, report: full.report };
  } else if (id === "ventas_por_dia") {
    const rows = await tx.$queryRaw<{ day: string; n: bigint; total: bigint }[]>`
      SELECT to_char(s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${SHOP_TIME_ZONE}, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS n, COALESCE(SUM(s."totalCents"),0)::bigint AS total
      FROM "Sale" s WHERE s."companyId" = ${ctx.companyId} ${br} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
      GROUP BY 1 ORDER BY 1`;
    const sum = rows.reduce((a, r) => a + Number(r.total), 0);
    table = { ...base, subtitle: period, columns: ["Fecha", "Ventas", `Vendido ${refTag}`], rows: rows.map((r) => [fmtDate(r.day), String(r.n), m(Number(r.total))]), totals: ["Total", String(rows.reduce((a, r) => a + Number(r.n), 0)), m(sum)] };
    chartPoints = rows.map((r) => ({ label: fmtDate(r.day), value: Number(r.total) / 100, display: m(Number(r.total)) }));
  } else if (id === "ventas_recientes") {
    const rows = await tx.$queryRaw<{ n: number | null; at: Date; cust: string; st: string; total: number; voided: boolean }[]>`
      SELECT s."controlNumber" AS n, s."createdAt" AS at, TRIM(COALESCE(s."customerFirstName",'') || ' ' || COALESCE(s."customerLastName",'')) AS cust, s."paymentStatus"::text AS st, s."totalCents" AS total, s."voided" AS voided
      FROM "Sale" s WHERE s."companyId" = ${ctx.companyId} ${br} ORDER BY s."createdAt" DESC LIMIT 15`;
    table = { ...base, subtitle: "Las 15 más recientes", columns: ["Nº", "Fecha", "Cliente", "Estado", `Total ${refTag}`], rows: rows.map((r) => [r.n != null ? String(r.n) : "—", fmtDate(r.at), r.cust || "—", r.voided ? "Anulada" : r.st === "CREDIT" ? "A crédito" : "Pagada", m(r.total)]) };
  } else if (id === "top_productos") {
    const rows = await tx.$queryRaw<{ name: string; qty: bigint; total: bigint }[]>`
      SELECT si."productName" AS name, SUM(si."quantity")::bigint AS qty, SUM(si."subtotalCents")::bigint AS total
      FROM "SaleItem" si JOIN "Sale" s ON s.id = si."saleId"
      WHERE s."companyId" = ${ctx.companyId} ${br} AND s."voided" = false AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
      GROUP BY 1 ORDER BY total DESC LIMIT 10`;
    table = { ...base, subtitle: period, columns: ["Producto", "Unidades", `Vendido ${refTag}`], rows: rows.map((r) => [r.name, String(r.qty), m(Number(r.total))]) };
    chartPoints = rows.map((r) => ({ label: r.name.slice(0, 16), value: Number(r.total) / 100, display: m(Number(r.total)) }));
  } else if (id === "stock_bajo") {
    const rows = await tx.$queryRaw<{ name: string; category: string | null; stock: number; min: number }[]>`
      SELECT "name", "category", "stock", "lowStockThreshold" AS min FROM "Product"
      WHERE "companyId" = ${ctx.companyId} ${ctx.branchId ? Prisma.sql`AND "branchId" = ${ctx.branchId}` : Prisma.empty}
        AND "trackStock" = true AND "stock" <= "lowStockThreshold" AND ("isActive" = true OR "stock" = 0)
      ORDER BY "stock" ASC, "name" ASC LIMIT 30`;
    table = { ...base, subtitle: "Existencia igual o menor al mínimo", columns: ["Producto", "Categoría", "Stock", "Mínimo"], rows: rows.map((r) => [r.name, r.category ?? "—", String(r.stock), String(r.min)]) };
  } else if (id === "inventario") {
    const rows = await tx.$queryRaw<{ name: string; category: string | null; stock: number; track: boolean; price: number }[]>`
      SELECT "name", "category", "stock", "trackStock" AS track, "priceCents" AS price FROM "Product"
      WHERE "companyId" = ${ctx.companyId} ${ctx.branchId ? Prisma.sql`AND "branchId" = ${ctx.branchId}` : Prisma.empty} AND "isActive" = true
      ORDER BY "category" NULLS LAST, "name" LIMIT 80`;
    table = { ...base, subtitle: `${rows.length} productos activos`, columns: ["Producto", "Categoría", "Stock", "Precio"], rows: rows.map((r) => [r.name, r.category ?? "—", r.track ? String(r.stock) : "—", m(r.price)]) };
  } else if (id === "cuentas_por_cobrar") {
    const rows = await tx.$queryRaw<{ n: number | null; at: Date; cust: string; total: number; paid: bigint }[]>`
      SELECT s."controlNumber" AS n, s."createdAt" AS at, TRIM(COALESCE(s."customerFirstName",'') || ' ' || COALESCE(s."customerLastName",'')) AS cust, s."totalCents" AS total,
             COALESCE((SELECT SUM(sp."amountEurCents") FROM "SalePayment" sp WHERE sp."saleId" = s.id),0)::bigint AS paid
      FROM "Sale" s WHERE s."companyId" = ${ctx.companyId} ${br} AND s."paymentStatus" = 'CREDIT' AND s."voided" = false
      ORDER BY s."createdAt" ASC LIMIT 40`;
    const open = rows.map((r) => ({ ...r, left: r.total - Number(r.paid) })).filter((r) => r.left > 0);
    table = { ...base, subtitle: "Ventas a crédito con saldo, de la más antigua a la más reciente", columns: ["Nº", "Fecha", "Cliente", `Debe ${refTag}`, "Equiv. Bs hoy"], rows: open.map((r) => [r.n != null ? String(r.n) : "—", fmtDate(r.at), r.cust || "—", m(r.left), rate ? formatCurrencyCents(comp?.localCurrencyCode ?? "VES", Math.round(r.left * rate)) : "—"]), totals: ["", "", "Total por cobrar", m(open.reduce((a, r) => a + r.left, 0)), rate ? formatCurrencyCents(comp?.localCurrencyCode ?? "VES", Math.round(open.reduce((a, r) => a + r.left, 0) * rate)) : "—"] };
  } else if (id === "gastos_por_categoria") {
    const rows = await tx.$queryRaw<{ cat: string; total: bigint }[]>`
      SELECT COALESCE(NULLIF("category",''),'Otros') AS cat, SUM("amountCents")::bigint AS total FROM "Expense"
      WHERE "companyId" = ${ctx.companyId} AND "spentAt" >= ${start} AND "spentAt" < ${end} GROUP BY 1 ORDER BY total DESC`;
    const sum = rows.reduce((a, r) => a + Number(r.total), 0);
    table = { ...base, subtitle: period, columns: ["Categoría", `Gastado ${refTag}`], rows: rows.map((r) => [r.cat, m(Number(r.total))]), totals: ["Total", m(sum)] };
    chartPoints = rows.map((r) => ({ label: r.cat.slice(0, 16), value: Number(r.total) / 100, display: m(Number(r.total)) }));
  } else {
    const rows = await tx.$queryRaw<{ cust: string; n: bigint; total: bigint }[]>`
      SELECT TRIM(COALESCE(s."customerFirstName",'') || ' ' || COALESCE(s."customerLastName",'')) AS cust, COUNT(*)::bigint AS n, SUM(s."totalCents")::bigint AS total
      FROM "Sale" s WHERE s."companyId" = ${ctx.companyId} ${br} AND s."voided" = false AND s."customerPhone" <> '0000-0000000' AND s."createdAt" >= ${start} AND s."createdAt" < ${end}
      GROUP BY 1 ORDER BY total DESC LIMIT 10`;
    table = { ...base, subtitle: period, columns: ["Cliente", "Compras", `Total ${refTag}`], rows: rows.map((r) => [r.cust || "—", String(r.n), m(Number(r.total))]) };
  }
  return { ...table, table, chartPoints };
}

// ---------- Venta propuesta: cálculo exacto con los precios reales ----------

export type SalePlan = {
  preview: SalePreview;
  ok: boolean;
  // Datos listos para completeSale (solo si ok).
  input?: Record<string, unknown>;
};

export async function planSale(tx: Tx, ctx: DataCtx, p: Extract<Proposal, { type: "SALE" }>): Promise<SalePlan> {
  const issues: string[] = [];
  const company = await tx.company.findUnique({
    where: { id: ctx.companyId },
    select: { exchangeRate: true, exchangeRateEnabled: true, localCurrencyCode: true, requireCustomerOnSale: true, referenceCurrency: true },
  });
  const rate = company?.exchangeRateEnabled && company.exchangeRate ? Number(company.exchangeRate) : null;
  if (!ctx.branchId) issues.push('Selecciona una sucursal: no se puede vender con "Todas las sucursales".');

  const products = await tx.product.findMany({ where: { id: { in: p.items.map((i) => i.productId) }, companyId: ctx.companyId, ...(ctx.branchId ? { branchId: ctx.branchId } : {}) } });
  const byId = new Map(products.map((x) => [x.id, x]));
  let total = 0;
  const lines: SalePreview["lines"] = [];
  const cartItems: { productId: string; quantity: number }[] = [];
  for (const it of p.items) {
    const prod = byId.get(it.productId);
    if (!prod) {
      issues.push("Uno de los productos ya no existe en esta sucursal.");
      continue;
    }
    if (prod.trackStock && prod.stock < it.quantity) issues.push(`Stock insuficiente de «${prod.name}» (hay ${prod.stock}).`);
    const unit = resolveTierPrice(prod, it.quantity).priceCents;
    const raw = unit * it.quantity;
    const sub = raw - computeItemDiscountCents(raw, p.discountPercent);
    total += sub;
    lines.push({ name: prod.name, quantity: it.quantity, unit: formatCurrencyCents(ctx.currency, unit), subtotal: formatCurrencyCents(ctx.currency, sub) });
    cartItems.push({ productId: prod.id, quantity: it.quantity });
  }

  // Cliente: existente por teléfono, o «Cliente general».
  let customer = { firstName: "Cliente", lastName: "general", phone: "0000-0000000", address: "Venta sin datos", rif: "" };
  if (p.customerPhone) {
    const c = await tx.customer.findFirst({ where: { companyId: ctx.companyId, phone: p.customerPhone } });
    if (c) customer = { firstName: c.firstName, lastName: c.lastName, phone: c.phone, address: c.address ?? "Sin dirección", rif: c.rif ?? "" };
    else issues.push("No encontré a ese cliente: elige uno registrado o vende como cliente general.");
  }
  if (customer.phone === "0000-0000000") {
    if (p.paymentStatus === "CREDIT") issues.push("La venta a crédito necesita un cliente registrado.");
    if (company?.requireCustomerOnSale) issues.push("Tu empresa exige un cliente registrado en cada venta.");
  }

  const ref = p.reference || (["CASH"].includes(p.paymentMethod) ? undefined : "Asistente IA");
  let payments: { paymentMethod: string; amount: number; paidInForeignCurrency: boolean; reference?: string }[] = [];
  if (p.paymentStatus === "PAID") {
    // Se cobra en la moneda local si la empresa maneja tasa; si no, en la divisa de referencia.
    const usdMethods = ["ZELLE", "BINANCE", "PAYPAL"];
    // SaleSchema recibe el monto en unidades (no en centavos).
    const major = usdMethods.includes(p.paymentMethod) || !rate ? total / 100 : Math.round(eurCentsToLocal(total, rate) * 100) / 100;
    payments = [{ paymentMethod: p.paymentMethod, amount: major, paidInForeignCurrency: false, reference: ref }];
  }
  const ok = issues.length === 0 && cartItems.length > 0;
  const methodLabel: Record<string, string> = { CASH: "Efectivo", CARD: "Pago Móvil", TRANSFER: "Transferencia", ZELLE: "Zelle", BINANCE: "Binance", PAYPAL: "PayPal", POS: "Punto de venta", OTHER: "Otro" };
  return {
    ok,
    preview: {
      lines,
      total: formatCurrencyCents(ctx.currency, total),
      discountPercent: p.discountPercent,
      customer: customer.phone === "0000-0000000" ? "Cliente general" : `${customer.firstName} ${customer.lastName}`,
      paymentLabel: p.paymentStatus === "CREDIT" ? "A crédito (cuenta por cobrar)" : `Pagada · ${methodLabel[p.paymentMethod] ?? p.paymentMethod}`,
      issues,
    },
    input: ok
      ? {
          items: cartItems,
          paymentStatus: p.paymentStatus,
          channel: "MOSTRADOR",
          payments,
          discountPercent: p.discountPercent,
          note: p.note ? `${p.note} · Creada con el Asistente IA` : "Creada con el Asistente IA",
          customerFirstName: customer.firstName,
          customerLastName: customer.lastName,
          customerPhone: customer.phone,
          customerAddress: customer.address,
          customerRif: customer.rif || undefined,
          idempotencyKey: crypto.randomUUID(),
        }
      : undefined,
  };
}
