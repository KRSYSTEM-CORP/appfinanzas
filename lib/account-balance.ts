import "server-only";
import { Prisma, type PaymentAccount } from "@prisma/client";
import { bq, jsDate } from "@/lib/batch-sql";
import { scopeMemo } from "@/lib/tenant-db";
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

export function currentRateOf(tx: Tx, companyId: string): Promise<number | null> {
  return scopeMemo(`rateOf:${companyId}`, async () => {
    const [co] = await bq<{ rate: number | null; enabled: boolean }>(tx)`SELECT "exchangeRate"::float8 AS rate, "exchangeRateEnabled" AS enabled FROM "Company" WHERE "id" = ${companyId}`;
    return co?.enabled && co.rate ? Number(co.rate) : null;
  });
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
  // Las seis lecturas viajan juntas en una sola sentencia (lib/batch-sql.ts).
  type Dated<T> = T & { createdAt: string };
  const [paysRaw, fundingsRaw, purchaseRaw, payrollRaw, expenseRaw, outflowRaw] = await Promise.all([
    bq<Dated<{ paymentAccountId: string | null; paymentMethod: string; amountCurrencyCents: number | null; amountEurCents: number; currencyCode: string | null; exchangeRate: number | null }>>(tx)`
      SELECT sp."paymentAccountId", sp."paymentMethod"::text AS "paymentMethod", sp."createdAt", sp."amountCurrencyCents", sp."amountEurCents", sp."currencyCode", sp."exchangeRate"::float8 AS "exchangeRate"
      FROM "SalePayment" sp JOIN "Sale" s ON s."id" = sp."saleId"
      WHERE s."companyId" = ${companyId}
        AND (s."voided" = false OR EXISTS (SELECT 1 FROM "CashOutflow" co WHERE co."saleId" = s."id"))
        AND (sp."paymentAccountId" = ANY(${ids}::text[])
             ${methods.length ? Prisma.sql`OR (sp."paymentAccountId" IS NULL AND sp."paymentMethod"::text = ANY(${methods}::text[]))` : Prisma.empty})
        AND sp."createdAt" >= ${since}`,
    bq<Dated<{ paymentAccountId: string; amountCents: number }>>(tx)`
      SELECT "paymentAccountId", "createdAt", "amountCents" FROM "AccountFunding"
      WHERE "paymentAccountId" = ANY(${ids}::text[]) AND "createdAt" >= ${since}`,
    bq<Dated<{ paymentAccountId: string | null; amountCurrencyCents: number | null; amountEurCents: number; currencyCode: string | null; exchangeRate: number | null }>>(tx)`
      SELECT pp."paymentAccountId", pp."createdAt", pp."amountCurrencyCents", pp."amountEurCents", pp."currencyCode", pp."exchangeRate"::float8 AS "exchangeRate"
      FROM "PurchasePayment" pp JOIN "Purchase" p ON p."id" = pp."purchaseId"
      WHERE pp."paymentAccountId" = ANY(${ids}::text[]) AND p."companyId" = ${companyId} AND p."voided" = false AND pp."createdAt" >= ${since}`,
    bq<Dated<{ paymentAccountId: string | null; accountDebitCents: number | null; paidCents: number }>>(tx)`
      SELECT "paymentAccountId", "createdAt", "accountDebitCents", "paidCents" FROM "PayrollPayment"
      WHERE "paymentAccountId" = ANY(${ids}::text[]) AND "companyId" = ${companyId} AND "createdAt" >= ${since}`,
    bq<Dated<{ paymentAccountId: string | null; amountCents: number; localAmountCents: number | null; enteredInLocal: boolean }>>(tx)`
      SELECT "paymentAccountId", "createdAt", "amountCents", "localAmountCents", "enteredInLocal" FROM "Expense"
      WHERE "paymentAccountId" = ANY(${ids}::text[]) AND "companyId" = ${companyId} AND "createdAt" >= ${since}`,
    bq<Dated<{ paymentAccountId: string | null; amountCents: number; amountCurrencyCents: number | null; currencyCode: string | null; exchangeRate: number | null }>>(tx)`
      SELECT "paymentAccountId", "createdAt", "amountCents", "amountCurrencyCents", "currencyCode", "exchangeRate"::float8 AS "exchangeRate" FROM "CashOutflow"
      WHERE "paymentAccountId" = ANY(${ids}::text[]) AND "companyId" = ${companyId} AND "createdAt" >= ${since}`,
  ]);
  const dated = <T extends { createdAt: string }>(rows: T[]) => rows.map((r) => ({ ...r, createdAt: jsDate(r.createdAt) }));
  const pays = dated(paysRaw);
  const fundings = dated(fundingsRaw);
  const purchaseOut = dated(purchaseRaw);
  const payrollOut = dated(payrollRaw);
  const expenseOut = dated(expenseRaw);
  const outflowOut = dated(outflowRaw);
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
