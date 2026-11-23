import "server-only";
import type { PaymentAccount, Prisma } from "@prisma/client";
import { lineInAccountCurrency, payrollDebitCents, refToAccountCents } from "@/lib/account-money";
import type { ActionResult } from "@/lib/types";

type Tx = Prisma.TransactionClient;

export type AccountBalance = {
  collectedCents: number;
  // Inyecciones de fondos (aportes, depósitos) que se sumaron a mano.
  fundedCents: number;
  purchasesOutCents: number;
  payrollOutCents: number;
  expensesOutCents: number;
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
export async function accountBalance(tx: Tx, companyId: string, a: AccountForBalance, currentRate: number | null): Promise<AccountBalance> {
  let collected = 0;
  if (a.linkedMethod) {
    const pays = await tx.salePayment.findMany({
      where: { paymentMethod: a.linkedMethod, sale: { companyId, voided: false }, createdAt: { gte: a.balanceSince } },
      select: { amountCurrencyCents: true, amountEurCents: true, currencyCode: true, exchangeRate: true },
    });
    collected = pays.reduce((n, p) => n + lineInAccountCurrency(p, a.currency, currentRate), 0);
  }
  const [fundings, purchaseOut, payrollOut, expenseOut] = await Promise.all([
    tx.accountFunding.aggregate({ where: { paymentAccountId: a.id, createdAt: { gte: a.balanceSince } }, _sum: { amountCents: true } }),
    tx.purchasePayment.findMany({
      where: { paymentAccountId: a.id, purchase: { companyId, voided: false }, createdAt: { gte: a.balanceSince } },
      select: { amountCurrencyCents: true, amountEurCents: true, currencyCode: true, exchangeRate: true },
    }),
    tx.payrollPayment.findMany({
      where: { paymentAccountId: a.id, companyId, createdAt: { gte: a.balanceSince } },
      select: { accountDebitCents: true, paidCents: true },
    }),
    tx.expense.findMany({
      where: { paymentAccountId: a.id, companyId, createdAt: { gte: a.balanceSince } },
      select: { amountCents: true, localAmountCents: true, enteredInLocal: true },
    }),
  ]);
  const funded = fundings._sum.amountCents ?? 0;
  const purchases = purchaseOut.reduce((n, p) => n + lineInAccountCurrency(p, a.currency, currentRate), 0);
  const payroll = payrollOut.reduce((n, p) => n + payrollDebitCents(p, a.currency, currentRate), 0);
  const expenses = expenseOut.reduce((n, e) => n + expenseDebitCents(e, a.currency, currentRate), 0);
  const paidOut = purchases + payroll + expenses;
  return {
    collectedCents: collected,
    fundedCents: funded,
    purchasesOutCents: purchases,
    payrollOutCents: payroll,
    expensesOutCents: expenses,
    paidOutCents: paidOut,
    balanceCents: a.openingCents + collected + funded - paidOut,
  };
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
