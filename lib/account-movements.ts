import "server-only";
import type { PaymentAccount, Prisma } from "@prisma/client";
import { lineInAccountCurrency, payrollDebitCents } from "@/lib/account-money";
import { collectedWhere, expenseDebitCents } from "@/lib/account-balance";

type Tx = Prisma.TransactionClient;

export type AccountMovement = {
  id: string;
  at: string;
  kind: "COBRO" | "FONDOS" | "COMPRA" | "NOMINA" | "GASTO";
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
  const [sales, fundings, purchases, payroll, expenses] = await Promise.all([
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
  ]);
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
  ];
  const sorted = out.sort((x, y) => (x.at < y.at ? 1 : -1));
  return limit != null ? sorted.slice(0, limit) : sorted;
}
