import "server-only";
import type { PaymentAccount, Prisma } from "@prisma/client";
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
  const since = { gte: new Date(Math.min(...accounts.map((a) => a.balanceSince.getTime()))) };
  const methods = [...new Set(accounts.flatMap((a) => (a.linkedMethod ? [a.linkedMethod] : [])))];
  const extra: { AND?: { OR: { createdAt: { gte: Date; lt: Date } }[] }[] } = windows ? { AND: [{ OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })) }] } : {};
  const [sales, fundings, purchases, payroll, expenses, outflows] = await Promise.all([
    tx.salePayment.findMany({
      where: {
        sale: { companyId, OR: [{ voided: false }, { voided: true, cashOutflows: { some: {} } }] },
        OR: [{ paymentAccountId: { in: ids } }, ...(methods.length ? [{ paymentAccountId: null, paymentMethod: { in: methods } }] : [])],
        createdAt: since,
        ...extra,
      },
      select: { id: true, paymentAccountId: true, paymentMethod: true, createdAt: true, amountCurrencyCents: true, amountEurCents: true, currencyCode: true, exchangeRate: true, reference: true },
    }),
    tx.accountFunding.findMany({ where: { paymentAccountId: { in: ids }, createdAt: since, ...extra } }),
    tx.purchasePayment.findMany({
      where: { paymentAccountId: { in: ids }, purchase: { companyId, voided: false }, createdAt: since, ...extra },
      select: { id: true, paymentAccountId: true, createdAt: true, amountCurrencyCents: true, amountEurCents: true, currencyCode: true, exchangeRate: true, reference: true, purchase: { select: { supplierInvoiceNo: true, manualSupplierName: true, supplier: { select: { name: true } } } } },
    }),
    tx.payrollPayment.findMany({
      where: { paymentAccountId: { in: ids }, companyId, createdAt: since, ...extra },
      select: { id: true, paymentAccountId: true, createdAt: true, accountDebitCents: true, paidCents: true, isAdvance: true, employee: { select: { name: true } } },
    }),
    tx.expense.findMany({
      where: { paymentAccountId: { in: ids }, companyId, createdAt: since, ...extra },
      select: { id: true, paymentAccountId: true, createdAt: true, description: true, amountCents: true, localAmountCents: true, enteredInLocal: true },
    }),
    tx.cashOutflow.findMany({
      where: { paymentAccountId: { in: ids }, companyId, createdAt: since, ...extra },
      select: { id: true, paymentAccountId: true, createdAt: true, concept: true, amountCents: true, amountCurrencyCents: true, currencyCode: true, exchangeRate: true, saleId: true },
    }),
  ]);
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
