"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireSession, requireManagerOrPermission } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import type { ActionResult } from "@/lib/types";
import type { PaymentAccountKind } from "@prisma/client";
import { defaultCurrencyForKind } from "@/lib/account-money";
import { accountMovementsList, type AccountMovement } from "@/lib/account-movements";
import { accountBalances, currentRateOf } from "@/lib/account-balance";
import { normalizeBankSiteUrl } from "@/lib/bank-sites";

export type PaymentAccountRow = {
  id: string;
  kind: PaymentAccountKind;
  bankKey: string | null;
  bankName: string | null;
  holder: string | null;
  accountNumber: string;
  docId: string | null;
  note: string | null;
  active: boolean;
  websiteUrl: string | null;
};

const AccountSchema = z.object({
  kind: z.enum(["PAGO_MOVIL", "TRANSFER", "ZELLE", "BINANCE", "PAYPAL", "PUNTO_DE_VENTA"]),
  bankKey: z.string().trim().max(40).optional(),
  bankName: z.string().trim().max(80).optional(),
  holder: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().min(3, "Escribe el dato de la cuenta").max(120),
  docId: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
  websiteUrl: z.string().trim().max(200).optional(),
});

// Todos los usuarios de la empresa los ven (el POS los muestra al cobrar).
export async function listPaymentAccounts(onlyActive = true): Promise<PaymentAccountRow[]> {
  const { companyId } = await requireSession();
  return withTenant(companyId, (tx) =>
    tx.paymentAccount.findMany({
      where: { companyId, ...(onlyActive ? { active: true } : {}) },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      select: {
        id: true, kind: true, bankKey: true, bankName: true, holder: true,
        accountNumber: true, docId: true, note: true, active: true, websiteUrl: true,
      },
    })
  );
}

export type SourceAccountRow = { id: string; label: string; currency: string; kind: PaymentAccountKind; balanceCents: number };

// Cuentas activas que pueden ser el origen de un pago (compras, nómina, gastos): su saldo baja al pagar.
// Incluye el saldo para mostrarlo al elegir la cuenta y avisar antes de que falten fondos.
export async function listSourceAccounts(includePos = false): Promise<SourceAccountRow[]> {
  const { companyId } = await requireManagerOrPermission("admin", "purchases");
  return withTenant(companyId, async (tx) => {
    const rate = await currentRateOf(tx, companyId);
    const rows = await tx.paymentAccount.findMany({ where: { companyId, active: true, ...(includePos ? {} : { kind: { not: "PUNTO_DE_VENTA" as const } }) }, orderBy: { createdAt: "asc" } });
    const out: SourceAccountRow[] = [];
    const balances = await accountBalances(tx, companyId, rows, rate);
    for (const a of rows) {
      const b = balances.get(a.id)!;
      out.push({
        id: a.id,
        label: [a.bankName ?? a.kind, a.accountNumber].filter(Boolean).join(" · "),
        currency: a.currency,
        kind: a.kind,
        balanceCents: b.balanceCents,
      });
    }
    return out;
  });
}

export async function savePaymentAccount(input: unknown, id?: string): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = AccountSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;
  const data = {
    kind: d.kind,
    bankKey: d.bankKey || null,
    bankName: d.bankName || null,
    holder: d.holder || null,
    accountNumber: d.accountNumber,
    docId: d.docId || null,
    note: d.note || null,
    websiteUrl: normalizeBankSiteUrl(d.websiteUrl),
  };
  await withTenant(companyId, async (tx) => {
    if (id) await tx.paymentAccount.updateMany({ where: { id, companyId }, data });
    else await tx.paymentAccount.create({ data: { ...data, companyId, currency: defaultCurrencyForKind(d.kind) } });
  });
  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/accounting/accounts");
  revalidatePath("/purchases");
  return { success: true };
}

export async function setPaymentAccountActive(id: string, active: boolean): Promise<ActionResult> {
  const { companyId } = await requireManager();
  await withTenant(companyId, (tx) => tx.paymentAccount.updateMany({ where: { id, companyId }, data: { active } }));
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

// Interruptor de un método en Ajustes → Pagos y Moneda: muestra u oculta en el POS todas las
// cuentas de cobro de ese tipo.
export async function setPaymentAccountsActiveByKind(kind: PaymentAccountKind, active: boolean): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = AccountSchema.shape.kind.safeParse(kind);
  if (!parsed.success) return { success: false, error: "Método inválido" };
  await withTenant(companyId, (tx) => tx.paymentAccount.updateMany({ where: { companyId, kind: parsed.data }, data: { active } }));
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

export async function deletePaymentAccount(id: string): Promise<ActionResult> {
  const { companyId } = await requireManager();
  await withTenant(companyId, (tx) => tx.paymentAccount.deleteMany({ where: { id, companyId } }));
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}


export type AccountBalanceRow = {
  id: string;
  label: string;
  currency: string;
  linkedMethod: string | null;
  openingCents: number;
  collectedCents: number;
  // Inyecciones de fondos sumadas a mano.
  fundedCents: number;
  // Lo que salió de la cuenta: pagos de compras, de nómina y gastos desde esta cuenta.
  paidOutCents: number;
  balanceCents: number;
};

// Saldo por cuenta = inicial + cobros (no anulados) del método vinculado + inyecciones − pagos hechos desde la
// cuenta (compras, nómina y gastos), todo desde la fecha de inicio.
export async function getAccountBalances(): Promise<AccountBalanceRow[]> {
  const { companyId } = await requireManagerOrPermission("admin");
  return withTenant(companyId, async (tx) => {
    const accounts = await tx.paymentAccount.findMany({ where: { companyId, active: true }, orderBy: { createdAt: "asc" } });
    const currentRate = await currentRateOf(tx, companyId);
    const rows: AccountBalanceRow[] = [];
    const balances = await accountBalances(tx, companyId, accounts, currentRate);
    for (const a of accounts) {
      const b = balances.get(a.id)!;
      rows.push({
        id: a.id,
        label: [a.bankName, a.accountNumber].filter(Boolean).join(" · "),
        currency: a.currency,
        linkedMethod: a.linkedMethod,
        openingCents: a.openingCents,
        collectedCents: b.collectedCents,
        fundedCents: b.fundedCents,
        paidOutCents: b.paidOutCents,
        balanceCents: b.balanceCents,
      });
    }
    return rows;
  });
}

const FundSchema = z.object({
  accountId: z.string().trim().min(1).max(40),
  // Monto en la moneda de la cuenta, en centavos.
  amountCents: z.number().int().min(1, "Escribe un monto mayor a 0").max(1_000_000_000),
  note: z.string().trim().max(200).optional(),
});

// «Agregar fondos»: inyecta dinero a una cuenta (aporte del dueño, depósito, saldo que faltaba). Suma a su saldo.
export async function addAccountFunds(input: unknown): Promise<ActionResult> {
  const { companyId, userId } = await requireManager();
  const parsed = FundSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const d = parsed.data;
  const ok = await withTenant(companyId, async (tx) => {
    const acc = await tx.paymentAccount.findFirst({ where: { id: d.accountId, companyId }, select: { id: true } });
    if (!acc) return false;
    await tx.accountFunding.create({
      data: { companyId, paymentAccountId: acc.id, amountCents: d.amountCents, note: d.note || null, createdById: userId },
    });
    return true;
  });
  if (!ok) return { success: false, error: "La cuenta no existe" };
  revalidatePath("/accounting/accounts");
  revalidatePath("/purchases");
  revalidatePath("/payroll");
  revalidatePath("/accounting/gastos");
  return { success: true };
}

export type { AccountMovement } from "@/lib/account-movements";

// Movimientos de una cuenta (cobros, inyecciones, compras, nómina y gastos), del más reciente al más antiguo.
// `limit` null = historial completo; `windows` limita a esos períodos.
export async function getAccountMovements(accountId: string, limit: number | null = 40, windows?: { start: Date; end: Date }[]): Promise<AccountMovement[]> {
  const { companyId } = await requireManagerOrPermission("admin");
  return withTenant(companyId, async (tx) => {
    const a = await tx.paymentAccount.findFirst({ where: { id: accountId, companyId } });
    if (!a) return [];
    const rate = await currentRateOf(tx, companyId);
    return accountMovementsList(tx, companyId, a, rate, limit, windows);
  });
}

const BalanceSchema = z.object({
  currency: z.enum(["USD", "VES"]),
  openingCents: z.number().int().min(0).max(1_000_000_000),
  linkedMethod: z.enum(["CASH", "CARD", "OTHER", "ZELLE", "BINANCE", "PAYPAL", "POS", "TRANSFER"]).nullable(),
});

export async function setAccountBalanceConfig(id: string, input: unknown): Promise<ActionResult> {
  const { companyId } = await requireManager();
  const parsed = BalanceSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Datos inválidos" };
  await withTenant(companyId, (tx) =>
    tx.paymentAccount.updateMany({ where: { id, companyId }, data: { ...parsed.data, balanceSince: new Date() } })
  );
  revalidatePath("/accounting/accounts");
  return { success: true };
}
