"use server";

import { Prisma, type PaymentMethod } from "@prisma/client";
import { requireManagerOrPermission } from "@/lib/session";
import { withTenant } from "@/lib/tenant-db";
import { selectionToWindows, type DateRangeSelection } from "@/lib/report-types";

export type OutflowHistoryRow = {
  id: string;
  createdAt: string;
  concept: string;
  paymentMethod: PaymentMethod | null;
  accountId: string | null;
  accountLabel: string | null;
  amountCents: number; // referencia
  amountCurrencyCents: number | null;
  currencyCode: string | null;
  createdByName: string | null;
  saleId: string | null;
  saleNumber: number | null;
};

export type OutflowFilters = { method?: string; accountId?: string };

const METHODS = ["CASH", "CARD", "POS", "TRANSFER", "ZELLE", "BINANCE", "PAYPAL", "OTHER"];

// Administración → Balance → Salidas y devoluciones: salidas de Caja Chica y devoluciones por anulación del periodo,
// con de dónde salió el dinero. Filtra por método (Efectivo incluye las anteriores sin método) y por cuenta.
export async function listOutflowHistory(range: DateRangeSelection, filters: OutflowFilters = {}): Promise<OutflowHistoryRow[]> {
  const { companyId, branchId } = await requireManagerOrPermission("admin");
  const windows = selectionToWindows(range);
  if (windows.length === 0) return [];
  const where: Prisma.CashOutflowWhereInput = {
    companyId,
    ...(branchId ? { branchId } : {}),
    OR: windows.map((w) => ({ createdAt: { gte: w.start, lt: w.end } })),
  };
  const and: Prisma.CashOutflowWhereInput[] = [];
  if (filters.method && METHODS.includes(filters.method)) {
    and.push(filters.method === "CASH" ? { OR: [{ paymentMethod: "CASH" }, { paymentMethod: null }] } : { paymentMethod: filters.method as PaymentMethod });
  }
  if (filters.accountId) and.push({ paymentAccountId: filters.accountId });
  return withTenant(companyId, async (tx) => {
    const rows = await tx.cashOutflow.findMany({
      where: { ...where, ...(and.length ? { AND: and } : {}) },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, createdAt: true, concept: true, paymentMethod: true, paymentAccountId: true, amountCents: true,
        amountCurrencyCents: true, currencyCode: true, createdById: true, saleId: true,
        paymentAccount: { select: { bankName: true, kind: true, accountNumber: true } },
        sale: { select: { controlNumber: true } },
      },
    });
    const userIds = [...new Set(rows.map((r) => r.createdById))];
    const users = userIds.length
      ? await tx.user.findMany({ where: { id: { in: userIds }, companyId }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const names = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      concept: r.concept,
      paymentMethod: r.paymentMethod,
      accountId: r.paymentAccountId,
      accountLabel: r.paymentAccount ? [r.paymentAccount.bankName ?? r.paymentAccount.kind, r.paymentAccount.accountNumber].filter(Boolean).join(" · ") : null,
      amountCents: r.amountCents,
      amountCurrencyCents: r.amountCurrencyCents,
      currencyCode: r.currencyCode,
      createdByName: names.get(r.createdById) ?? null,
      saleId: r.saleId,
      saleNumber: r.sale?.controlNumber ?? null,
    }));
  });
}
