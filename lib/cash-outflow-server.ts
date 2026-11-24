import "server-only";
import type { Prisma } from "@prisma/client";
import { assertAccountFunds } from "@/lib/account-balance";
import { methodForAccountKind } from "@/lib/account-money";
import { outflowCurrencyFor, outflowDebitCents, resolveOutflowAmount, type OutflowMoneyCtx, type OutflowSource } from "@/lib/cash-outflow";

type Tx = Prisma.TransactionClient;

export async function outflowMoneyCtx(tx: Tx, companyId: string): Promise<OutflowMoneyCtx> {
  const co = await tx.company.findUnique({
    where: { id: companyId },
    select: { exchangeRate: true, exchangeRateEnabled: true, localCurrencyCode: true, referenceCurrency: true },
  });
  const rateEnabled = !!(co?.exchangeRateEnabled && co.exchangeRate);
  return {
    rate: rateEnabled ? Number(co!.exchangeRate) : null,
    rateEnabled,
    localCurrencyCode: co?.localCurrencyCode ?? "VES",
    referenceCurrency: co?.referenceCurrency ?? "USD",
  };
}

type OutflowBase = { companyId: string; branchId: string; date: Date; shiftNumber: number; concept: string; createdById: string; saleId?: string | null };

// Guarda una o varias salidas (efectivo o desde cuentas) en una sola transacción: valida las cuentas, exige saldo
// suficiente y crea cada fila con su clave (`keyPrefix:i`), de modo que reintentar no duplica.
export async function createOutflows(tx: Tx, base: OutflowBase, sources: OutflowSource[], keyPrefix: string | null): Promise<number> {
  const ctx = await outflowMoneyCtx(tx, base.companyId);
  const rows: Prisma.CashOutflowUncheckedCreateInput[] = [];
  const checks: { accountId: string; debit: (cur: string, r: number | null) => number }[] = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    let method = s.paymentMethod;
    let accountId: string | null = null;
    let accountCurrency: string | null = null;
    if (s.paymentAccountId) {
      const acc = await tx.paymentAccount.findFirst({ where: { id: s.paymentAccountId, companyId: base.companyId }, select: { id: true, kind: true, currency: true } });
      if (!acc) throw new Error("La cuenta elegida no existe. Recarga la página e inténtalo de nuevo.");
      accountId = acc.id;
      accountCurrency = acc.currency;
      method = methodForAccountKind(acc.kind);
    }
    const currency = outflowCurrencyFor(method, accountCurrency, s.currency, ctx);
    const amt = resolveOutflowAmount(currency, s.amountCents, ctx);
    const money = { amountCents: amt.amountCents, amountCurrencyCents: amt.amountCurrencyCents, currencyCode: amt.currencyCode, exchangeRate: amt.exchangeRate };
    if (accountId) checks.push({ accountId, debit: (cur, r) => outflowDebitCents(money, cur, r) });
    rows.push({
      ...base,
      amountCents: amt.amountCents,
      paymentMethod: method,
      paymentAccountId: accountId,
      currencyCode: amt.currencyCode,
      amountCurrencyCents: amt.amountCurrencyCents,
      exchangeRate: amt.exchangeRate,
      requestKey: keyPrefix ? `${keyPrefix}:${i}` : null,
    });
  }
  await assertAccountFunds(tx, base.companyId, checks);
  for (const data of rows) await tx.cashOutflow.create({ data });
  return rows.length;
}
