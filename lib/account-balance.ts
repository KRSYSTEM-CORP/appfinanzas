import "server-only";
import type { PaymentAccount, Prisma } from "@prisma/client";
import { lineInAccountCurrency, payrollDebitCents, refToAccountCents } from "@/lib/account-money";
import { outflowDebitCents } from "@/lib/cash-outflow";
import type { ActionResult } from "@/lib/types";

type Tx = Prisma.TransactionClient;

export type AccountBalance = {
  collectedCents: number;
  // Inyecciones de fondos (aportes, depósitos) que se sumaron a mano.
  fundedCents: number;
  purchasesOutCents: number;
  payrollOutCents: number;
  expensesOutCents: number;
  // Salidas de Caja Chica y devoluciones por anulación pagadas desde la cuenta.
  outflowsOutCents: number;
  // Todo lo que salió de la cuenta (compras, nómina y gastos).
  paidOutCents: number;
  balanceCents: number;
};

type AccountForBalance = Pick<PaymentAccount, "id" | "currency" | "linkedMethod" | "balanceSince" | "openingCents">;

export async function currentRateOf(tx: Tx, companyId: string): Promise<number | null> {
  const co = await tx.company.findUnique({ where: { id: companyId }, select: { exchangeRate: true, exchangeRateEnabled: true } });
  return co?.exchangeRateEnabled && co.exchangeRate ? Number(co.exchangeRate) : null;
}

// Lo que un gasto descuenta de la cuenta, en la moneda de ella: en bolívares se toma lo anotado en Bs
// (o su equivalente a la tasa del día del gasto); en divisa, el monto referencial.
export function expenseDebitCents(
  e: { amountCents: number; localAmountCents: number | null; enteredInLocal: boolean },
  accountCurrency: string,
  currentRate: number | null
): number {
  if (accountCurrency === "VES") {
    if (e.localAmountCents != null) return e.localAmountCents;
    return refToAccountCents(e.amountCents, "VES", currentRate) ?? 0;
  }
  return e.amountCents;
}

// Saldo = inicial + cobros del método vinculado + inyecciones − pagos hechos desde la cuenta
// (compras, nómina y gastos), todo desde la fecha de inicio.
// Qué cobros de ventas entran a una cuenta: los que llevan su id y, para los que no indican cuenta (anteriores,
// efectivo, punto de venta), los del método vinculado.
export function collectedWhere(companyId: string, a: Pick<PaymentAccount, "id" | "linkedMethod">): Prisma.SalePaymentWhereInput {
  return {
    // Una venta anulada cuenta mientras tenga devolución registrada: lo cobrado sigue en la cuenta hasta que la devolución sale.
    sale: { companyId, OR: [{ voided: false }, { voided: true, cashOutflows: { some: {} } }] },
    OR: [{ paymentAccountId: a.id }, ...(a.linkedMethod ? [{ paymentAccountId: null, paymentMethod: a.linkedMethod }] : [])],
  };
}

// Las cuentas donde se recibe un cobro deben ser de la empresa (se rechaza un id ajeno).
export async function assertReceivingAccounts(tx: Tx, companyId: string, payments: { paymentAccountId?: string | null }[]): Promise<void> {
  const ids = [...new Set(payments.map((p) => p.paymentAccountId).filter((x): x is string => !!x))];
  if (ids.length === 0) return;
  const found = await tx.paymentAccount.count({ where: { id: { in: ids }, companyId } });
  if (found !== ids.length) throw new Error("La cuenta elegida no existe. Recarga la página e inténtalo de nuevo.");
}

export async function accountBalance(tx: Tx, companyId: string, a: AccountForBalance, currentRate: number | null): Promise<AccountBalance> {
  return (await accountBalances(tx, companyId, [a], currentRate)).get(a.id)!;
}

// Saldos de varias cuentas con 6 consultas en total (antes 6 por cuenta, una tras otra dentro de la transacción).
// Trae las filas desde la fecha de inicio más antigua y reparte cada una en JS con el mismo criterio por cuenta
// (balanceSince, método vinculado), así el resultado es idéntico al cálculo cuenta por cuenta.
export async function accountBalances(
  tx: Tx,
  companyId: string,
  accounts: AccountForBalance[],
  currentRate: number | null
): Promise<Map<string, AccountBalance>> {
  const result = new Map<string, AccountBalance>();
  if (accounts.length === 0) return result;
  const ids = accounts.map((a) => a.id);
  const since = new Date(Math.min(...accounts.map((a) => a.balanceSince.getTime())));
  const methods = [...new Set(accounts.flatMap((a) => (a.linkedMethod ? [a.linkedMethod] : [])))];
  const [pays, fundings, purchaseOut, payrollOut, expenseOut, outflowOut] = await Promise.all([
    tx.salePayment.findMany({
      where: {
        sale: { companyId, OR: [{ voided: false }, { voided: true, cashOutflows: { some: {} } }] },
        OR: [{ paymentAccountId: { in: ids } }, ...(methods.length ? [{ paymentAccountId: null, paymentMethod: { in: methods } }] : [])],
        createdAt: { gte: since },
      },
      select: { paymentAccountId: true, paymentMethod: true, createdAt: true, amountCurrencyCents: true, amountEurCents: true, currencyCode: true, exchangeRate: true },
    }),
    tx.accountFunding.findMany({
      where: { paymentAccountId: { in: ids }, createdAt: { gte: since } },
      select: { paymentAccountId: true, createdAt: true, amountCents: true },
    }),
    tx.purchasePayment.findMany({
      where: { paymentAccountId: { in: ids }, purchase: { companyId, voided: false }, createdAt: { gte: since } },
      select: { paymentAccountId: true, createdAt: true, amountCurrencyCents: true, amountEurCents: true, currencyCode: true, exchangeRate: true },
    }),
    tx.payrollPayment.findMany({
      where: { paymentAccountId: { in: ids }, companyId, createdAt: { gte: since } },
      select: { paymentAccountId: true, createdAt: true, accountDebitCents: true, paidCents: true },
    }),
    tx.expense.findMany({
      where: { paymentAccountId: { in: ids }, companyId, createdAt: { gte: since } },
      select: { paymentAccountId: true, createdAt: true, amountCents: true, localAmountCents: true, enteredInLocal: true },
    }),
    tx.cashOutflow.findMany({
      where: { paymentAccountId: { in: ids }, companyId, createdAt: { gte: since } },
      select: { paymentAccountId: true, createdAt: true, amountCents: true, amountCurrencyCents: true, currencyCode: true, exchangeRate: true },
    }),
  ]);
  for (const a of accounts) {
    const from = a.balanceSince.getTime();
    const mine = <T extends { paymentAccountId: string | null; createdAt: Date }>(rows: T[]) =>
      rows.filter((r) => r.paymentAccountId === a.id && r.createdAt.getTime() >= from);
    const collected = pays
      .filter(
        (p) =>
          p.createdAt.getTime() >= from &&
          (p.paymentAccountId === a.id || (p.paymentAccountId === null && !!a.linkedMethod && p.paymentMethod === a.linkedMethod))
      )
      .reduce((n, p) => n + lineInAccountCurrency(p, a.currency, currentRate), 0);
    const funded = mine(fundings).reduce((n, f) => n + f.amountCents, 0);
    const purchases = mine(purchaseOut).reduce((n, p) => n + lineInAccountCurrency(p, a.currency, currentRate), 0);
    const payroll = mine(payrollOut).reduce((n, p) => n + payrollDebitCents(p, a.currency, currentRate), 0);
    const expenses = mine(expenseOut).reduce((n, e) => n + expenseDebitCents(e, a.currency, currentRate), 0);
    const outflows = mine(outflowOut).reduce((n, o) => n + outflowDebitCents(o, a.currency, currentRate), 0);
    const paidOut = purchases + payroll + expenses + outflows;
    result.set(a.id, {
      collectedCents: collected,
      fundedCents: funded,
      purchasesOutCents: purchases,
      payrollOutCents: payroll,
      expensesOutCents: expenses,
      outflowsOutCents: outflows,
      paidOutCents: paidOut,
      balanceCents: a.openingCents + collected + funded - paidOut,
    });
  }
  return result;
}

function fmtAccountMoney(currency: string, cents: number): string {
  const n = (cents / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "VES" ? `Bs. ${n}` : `$${n}`;
}

// Se lanza cuando un pago sale de una cuenta que no tiene saldo para cubrirlo. La pantalla la convierte en
// un aviso con el botón «Agregar fondos» (ver toActionResult).
export class InsufficientFundsError extends Error {
  constructor(
    public accountId: string,
    public accountLabel: string,
    public accountCurrency: string,
    public balanceCents: number,
    public debitCents: number
  ) {
    super(
      `Fondos insuficientes en ${accountLabel}: tiene ${fmtAccountMoney(accountCurrency, Math.max(balanceCents, 0))} y el pago es de ${fmtAccountMoney(accountCurrency, debitCents)}.`
    );
  }
  get shortfallCents() {
    return Math.max(this.debitCents - Math.max(this.balanceCents, 0), 1);
  }
}

// Convierte cualquier error de una acción en su resultado; el de fondos insuficientes lleva el dato para el botón.
export function toActionResult(err: unknown, fallback: string): Extract<ActionResult, { success: false }> {
  if (err instanceof InsufficientFundsError) {
    return {
      success: false,
      error: err.message,
      code: "INSUFFICIENT_FUNDS",
      accountId: err.accountId,
      shortfallCents: err.shortfallCents,
      accountCurrency: err.accountCurrency,
    };
  }
  return { success: false, error: err instanceof Error ? err.message : fallback };
}

export type FundsCheck = {
  accountId: string;
  // Lo que este pago descuenta, en la moneda de la cuenta (la función recibe la moneda y la tasa del día).
  debit: (accountCurrency: string, rate: number | null) => number;
};

// Antes de guardar un pago desde una o varias cuentas: la cuenta debe ser de la empresa y estar activa, y
// su saldo debe cubrir lo que sale (varias líneas de la misma cuenta se suman). Lanza InsufficientFundsError.
export async function assertAccountFunds(tx: Tx, companyId: string, checks: FundsCheck[]): Promise<void> {
  if (checks.length === 0) return;
  const rate = await currentRateOf(tx, companyId);
  const ids = [...new Set(checks.map((c) => c.accountId))];
  const accounts = await tx.paymentAccount.findMany({ where: { id: { in: ids }, companyId } });
  for (const id of ids) {
    const a = accounts.find((x) => x.id === id);
    if (!a) throw new Error("La cuenta elegida no existe. Recarga la página e inténtalo de nuevo.");
    if (!a.active) throw new Error("La cuenta elegida está oculta. Actívala o elige otra.");
    const debit = checks.filter((c) => c.accountId === id).reduce((n, c) => n + c.debit(a.currency, rate), 0);
    if (debit <= 0) continue;
    const bal = await accountBalance(tx, companyId, a, rate);
    if (bal.balanceCents < debit) {
      const label = [a.bankName ?? a.kind, a.accountNumber].filter(Boolean).join(" · ");
      throw new InsufficientFundsError(a.id, label, a.currency, bal.balanceCents, debit);
    }
  }
}
