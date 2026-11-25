import "server-only";
import { Prisma, type PaymentAccount } from "@prisma/client";
import { bq, jsDate } from "@/lib/batch-sql";
import { lineInAccountCurrency, payrollDebitCents } from "@/lib/account-money";
import { outflowDebitCents } from "@/lib/cash-outflow";
import { collectedWhere, expenseDebitCents } from "@/lib/account-balance";

type Tx = Prisma.TransactionClient;

export type AccountMovement = {
  id: string;
  at: string;
  kind: "COBRO" | "FONDOS" | "COMPRA" | "NOMINA" | "GASTO" | "SALIDA";
  label: string;
  // Positivo entra a la cuenta, negativo sale; en la moneda de la cuenta.
  amountCents: number;
};

export type TimeWindow = { start: Date; end: Date };

// Movimientos de una cuenta (cobros, fondos, compras, nómina y gastos), del más reciente al más antiguo.
// Con `windows` solo cuentan los de esas ventanas [start, end); con `limit` null no se corta la lista.
export async function accountMovementsList(
  tx: Tx,
  companyId: string,
  a: PaymentAccount,
  rate: number | null,
  limit: number | null,
  windows?: TimeWindow[]
): Promise<AccountMovement[]> {
  const since = { gte: a.balanceSince };
  const extra: { AND?: { OR: { createdAt: { gte: Date; lt: Date } }[] }[] } = windows ? { AND: [{ OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })) }] } : {};
  const take = { take: limit ?? undefined };
  const [sales, fundings, purchases, payroll, expenses, outflows] = await Promise.all([
    tx.salePayment.findMany({
      where: { ...collectedWhere(companyId, a), createdAt: since, ...extra },
      select: { id: true, createdAt: true, amountCurrencyCents: true, amountEurCents: true, currencyCode: true, exchangeRate: true, reference: true },
      orderBy: { createdAt: "desc" },
      ...take,
    }),
    tx.accountFunding.findMany({ where: { paymentAccountId: a.id, createdAt: since, ...extra }, orderBy: { createdAt: "desc" }, ...take }),
    tx.purchasePayment.findMany({
      where: { paymentAccountId: a.id, purchase: { companyId, voided: false }, createdAt: since, ...extra },
      select: { id: true, createdAt: true, amountCurrencyCents: true, amountEurCents: true, currencyCode: true, exchangeRate: true, reference: true, purchase: { select: { supplierInvoiceNo: true, manualSupplierName: true, supplier: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      ...take,
    }),
    tx.payrollPayment.findMany({
      where: { paymentAccountId: a.id, companyId, createdAt: since, ...extra },
      select: { id: true, createdAt: true, accountDebitCents: true, paidCents: true, isAdvance: true, employee: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      ...take,
    }),
    tx.expense.findMany({
      where: { paymentAccountId: a.id, companyId, createdAt: since, ...extra },
      select: { id: true, createdAt: true, description: true, amountCents: true, localAmountCents: true, enteredInLocal: true },
      orderBy: { createdAt: "desc" },
      ...take,
    }),
    tx.cashOutflow.findMany({
      where: { paymentAccountId: a.id, companyId, createdAt: since, ...extra },
      select: { id: true, createdAt: true, concept: true, amountCents: true, amountCurrencyCents: true, currencyCode: true, exchangeRate: true, saleId: true },
      orderBy: { createdAt: "desc" },
      ...take,
    }),
  ]);
  return buildMovements(a, { sales, fundings, purchases, payroll, expenses, outflows } as MovementRows, rate, limit);
}

type MovementRows = {
  sales: { id: string; createdAt: Date; amountCurrencyCents: number | null; amountEurCents: number; currencyCode: string; exchangeRate: Prisma.Decimal | number | null; reference: string | null }[];
  fundings: { id: string; createdAt: Date; note: string | null; amountCents: number }[];
  purchases: { id: string; createdAt: Date; amountCurrencyCents: number | null; amountEurCents: number; currencyCode: string; exchangeRate: Prisma.Decimal | number | null; purchase: { manualSupplierName: string | null; supplier: { name: string } | null } }[];
  payroll: { id: string; createdAt: Date; accountDebitCents: number | null; paidCents: number; isAdvance: boolean; employee: { name: string } }[];
  expenses: { id: string; createdAt: Date; description: string; amountCents: number; localAmountCents: number | null; enteredInLocal: boolean }[];
  outflows: { id: string; createdAt: Date; concept: string; amountCents: number; amountCurrencyCents: number | null; currencyCode: string | null; exchangeRate: Prisma.Decimal | number | null; saleId: string | null }[];
};

function buildMovements(a: PaymentAccount, rows: MovementRows, rate: number | null, limit: number | null): AccountMovement[] {
  const { sales, fundings, purchases, payroll, expenses, outflows } = rows;
  const out: AccountMovement[] = [
    ...sales.map((p) => ({ id: `s${p.id}`, at: p.createdAt.toISOString(), kind: "COBRO" as const, label: p.reference ? `Cobro de venta · ref. ${p.reference}` : "Cobro de venta", amountCents: lineInAccountCurrency(p, a.currency, rate) })),
    ...fundings.map((f) => ({ id: `f${f.id}`, at: f.createdAt.toISOString(), kind: "FONDOS" as const, label: f.note ? `Fondos agregados · ${f.note}` : "Fondos agregados", amountCents: f.amountCents })),
    ...purchases.map((p) => ({
      id: `p${p.id}`,
      at: p.createdAt.toISOString(),
      kind: "COMPRA" as const,
      label: `Pago de compra · ${p.purchase.supplier?.name ?? p.purchase.manualSupplierName ?? "Proveedor"}`,
      amountCents: -lineInAccountCurrency(p, a.currency, rate),
    })),
    ...payroll.map((p) => ({
      id: `n${p.id}`,
      at: p.createdAt.toISOString(),
      kind: "NOMINA" as const,
      label: `${p.isAdvance ? "Adelanto" : "Nómina"} · ${p.employee.name}`,
      amountCents: -payrollDebitCents(p, a.currency, rate),
    })),
    ...expenses.map((e) => ({ id: `g${e.id}`, at: e.createdAt.toISOString(), kind: "GASTO" as const, label: `Gasto · ${e.description}`, amountCents: -expenseDebitCents(e, a.currency, rate) })),
    ...outflows.map((o) => ({ id: `o${o.id}`, at: o.createdAt.toISOString(), kind: "SALIDA" as const, label: `${o.saleId ? "Devolución" : "Salida de caja"} · ${o.concept}`, amountCents: -outflowDebitCents(o, a.currency, rate) })),
  ];
  const sorted = out.sort((x, y) => (x.at < y.at ? 1 : -1));
  return limit != null ? sorted.slice(0, limit) : sorted;
}

// Los movimientos de VARIAS cuentas con 6 consultas en total (antes 6 por cuenta, en serie), siempre sin límite.
// Trae las filas de todas las cuentas y las reparte por cuenta con el mismo criterio que accountMovementsList.
export async function accountMovementsMany(
  tx: Tx,
  companyId: string,
  accounts: PaymentAccount[],
  rate: number | null,
  windows?: TimeWindow[]
): Promise<Map<string, AccountMovement[]>> {
  const out = new Map<string, AccountMovement[]>();
  if (accounts.length === 0) return out;
  const ids = accounts.map((a) => a.id);
  const since = new Date(Math.min(...accounts.map((a) => a.balanceSince.getTime())));
  const methods = [...new Set(accounts.flatMap((a) => (a.linkedMethod ? [a.linkedMethod] : [])))];
  const win = (col: string) => (windows ? Prisma.sql`AND (${Prisma.join(windows.map((w) => Prisma.sql`(${Prisma.raw(col)} >= ${w.start} AND ${Prisma.raw(col)} < ${w.end})`), " OR ")})` : Prisma.empty);
  // Las seis lecturas viajan juntas en una sola sentencia (lib/batch-sql.ts).
  type Dated<T> = T & { createdAt: string };
  const [salesRaw, fundingsRaw, purchasesRaw, payrollRaw, expensesRaw, outflowsRaw] = await Promise.all([
    bq<Dated<{ id: string; paymentAccountId: string | null; paymentMethod: string; amountCurrencyCents: number | null; amountEurCents: number; currencyCode: string; exchangeRate: number | null; reference: string | null }>>(tx)`
      SELECT sp."id", sp."paymentAccountId", sp."paymentMethod"::text AS "paymentMethod", sp."createdAt", sp."amountCurrencyCents", sp."amountEurCents", sp."currencyCode", sp."exchangeRate"::float8 AS "exchangeRate", sp."reference"
      FROM "SalePayment" sp JOIN "Sale" s ON s."id" = sp."saleId"
      WHERE s."companyId" = ${companyId}
        AND (s."voided" = false OR EXISTS (SELECT 1 FROM "CashOutflow" co WHERE co."saleId" = s."id"))
        AND (sp."paymentAccountId" = ANY(${ids}::text[])
             ${methods.length ? Prisma.sql`OR (sp."paymentAccountId" IS NULL AND sp."paymentMethod"::text = ANY(${methods}::text[]))` : Prisma.empty})
        AND sp."createdAt" >= ${since} ${win('sp."createdAt"')}`,
    bq<Dated<{ id: string; paymentAccountId: string; note: string | null; amountCents: number }>>(tx)`
      SELECT "id", "paymentAccountId", "createdAt", "note", "amountCents" FROM "AccountFunding"
      WHERE "paymentAccountId" = ANY(${ids}::text[]) AND "createdAt" >= ${since} ${win('"createdAt"')}`,
    bq<Dated<{ id: string; paymentAccountId: string | null; amountCurrencyCents: number | null; amountEurCents: number; currencyCode: string; exchangeRate: number | null; manualSupplierName: string | null; supplierName: string | null }>>(tx)`
      SELECT pp."id", pp."paymentAccountId", pp."createdAt", pp."amountCurrencyCents", pp."amountEurCents", pp."currencyCode", pp."exchangeRate"::float8 AS "exchangeRate",
             p."manualSupplierName", sup."name" AS "supplierName"
      FROM "PurchasePayment" pp JOIN "Purchase" p ON p."id" = pp."purchaseId" LEFT JOIN "Supplier" sup ON sup."id" = p."supplierId"
      WHERE pp."paymentAccountId" = ANY(${ids}::text[]) AND p."companyId" = ${companyId} AND p."voided" = false
        AND pp."createdAt" >= ${since} ${win('pp."createdAt"')}`,
    bq<Dated<{ id: string; paymentAccountId: string | null; accountDebitCents: number | null; paidCents: number; isAdvance: boolean; employeeName: string }>>(tx)`
      SELECT pp."id", pp."paymentAccountId", pp."createdAt", pp."accountDebitCents", pp."paidCents", pp."isAdvance", e."name" AS "employeeName"
      FROM "PayrollPayment" pp JOIN "PayrollEmployee" e ON e."id" = pp."employeeId"
      WHERE pp."paymentAccountId" = ANY(${ids}::text[]) AND pp."companyId" = ${companyId}
        AND pp."createdAt" >= ${since} ${win('pp."createdAt"')}`,
    bq<Dated<{ id: string; paymentAccountId: string | null; description: string; amountCents: number; localAmountCents: number | null; enteredInLocal: boolean }>>(tx)`
      SELECT "id", "paymentAccountId", "createdAt", "description", "amountCents", "localAmountCents", "enteredInLocal" FROM "Expense"
      WHERE "paymentAccountId" = ANY(${ids}::text[]) AND "companyId" = ${companyId} AND "createdAt" >= ${since} ${win('"createdAt"')}`,
    bq<Dated<{ id: string; paymentAccountId: string | null; concept: string; amountCents: number; amountCurrencyCents: number | null; currencyCode: string | null; exchangeRate: number | null; saleId: string | null }>>(tx)`
      SELECT "id", "paymentAccountId", "createdAt", "concept", "amountCents", "amountCurrencyCents", "currencyCode", "exchangeRate"::float8 AS "exchangeRate", "saleId" FROM "CashOutflow"
      WHERE "paymentAccountId" = ANY(${ids}::text[]) AND "companyId" = ${companyId} AND "createdAt" >= ${since} ${win('"createdAt"')}`,
  ]);
  const dated = <T extends { createdAt: string }>(rows: T[]) => rows.map((r) => ({ ...r, createdAt: jsDate(r.createdAt) }));
  const sales = dated(salesRaw);
  const fundings = dated(fundingsRaw);
  const purchases = dated(purchasesRaw).map((p) => ({ ...p, purchase: { manualSupplierName: p.manualSupplierName, supplier: p.supplierName != null ? { name: p.supplierName } : null } }));
  const payroll = dated(payrollRaw).map((p) => ({ ...p, employee: { name: p.employeeName } }));
  const expenses = dated(expensesRaw);
  const outflows = dated(outflowsRaw);
  for (const a of accounts) {
    const from = a.balanceSince.getTime();
    const mine = <T extends { paymentAccountId: string | null; createdAt: Date }>(rows: T[]) =>
      rows.filter((r) => r.paymentAccountId === a.id && r.createdAt.getTime() >= from);
    out.set(
      a.id,
      buildMovements(
        a,
        {
          sales: sales.filter((p) => p.createdAt.getTime() >= from && (p.paymentAccountId === a.id || (p.paymentAccountId === null && !!a.linkedMethod && p.paymentMethod === a.linkedMethod))),
          fundings: mine(fundings),
          purchases: mine(purchases),
          payroll: mine(payroll),
          expenses: mine(expenses),
          outflows: mine(outflows),
        } as MovementRows,
        rate,
        null
      )
    );
  }
  return out;
}
