"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireSession } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import type { ActionResult } from "@/lib/types";
import type { PaymentAccountKind } from "@prisma/client";

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
};

const AccountSchema = z.object({
  kind: z.enum(["PAGO_MOVIL", "TRANSFER", "ZELLE", "BINANCE", "PAYPAL"]),
  bankKey: z.string().trim().max(40).optional(),
  bankName: z.string().trim().max(80).optional(),
  holder: z.string().trim().max(120).optional(),
  accountNumber: z.string().trim().min(3, "Escribe el dato de la cuenta").max(120),
  docId: z.string().trim().max(40).optional(),
  note: z.string().trim().max(200).optional(),
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
        accountNumber: true, docId: true, note: true, active: true,
      },
    })
  );
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
  };
  await withTenant(companyId, async (tx) => {
    if (id) await tx.paymentAccount.updateMany({ where: { id, companyId }, data });
    else await tx.paymentAccount.create({ data: { ...data, companyId } });
  });
  revalidatePath("/settings");
  revalidatePath("/pos");
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
  balanceCents: number;
};

// Saldo por cuenta = inicial + cobros (no anulados) del método vinculado desde la fecha de inicio.
export async function getAccountBalances(): Promise<AccountBalanceRow[]> {
  const { companyId } = await requireManager();
  return withTenant(companyId, async (tx) => {
    const accounts = await tx.paymentAccount.findMany({ where: { companyId, active: true }, orderBy: { createdAt: "asc" } });
    const rows: AccountBalanceRow[] = [];
    for (const a of accounts) {
      let collected = 0;
      if (a.linkedMethod) {
        const pays = await tx.salePayment.findMany({
          where: { paymentMethod: a.linkedMethod, sale: { companyId, voided: false }, createdAt: { gte: a.balanceSince } },
          select: { amountCurrencyCents: true, amountEurCents: true, currencyCode: true },
        });
        collected = pays.reduce((n, p) => n + (p.amountCurrencyCents ?? p.amountEurCents), 0);
      }
      rows.push({
        id: a.id,
        label: [a.bankName, a.accountNumber].filter(Boolean).join(" · "),
        currency: a.currency,
        linkedMethod: a.linkedMethod,
        openingCents: a.openingCents,
        collectedCents: collected,
        balanceCents: a.openingCents + collected,
      });
    }
    return rows;
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
