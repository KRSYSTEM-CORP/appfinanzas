import "server-only";
import { Prisma, type PaymentAccount } from "@prisma/client";
import { bq, jsDate } from "@/lib/batch-sql";
import { scopeMemo } from "@/lib/tenant-db";

type Tx = Prisma.TransactionClient;

// Cuentas de cobro y pago de la empresa como filas completas de PaymentAccount, con la lectura agrupada
// (lib/batch-sql.ts) y una sola vez por pantalla: Cuentas bancarias, Estados financieros y el selector de
// cuenta leían la misma lista varias veces. Orden: la más antigua primero (las inactivas al final si se piden todas).
export function loadPaymentAccounts(
  tx: Tx,
  companyId: string,
  opts: { onlyActive?: boolean; excludePos?: boolean; id?: string } = {}
): Promise<PaymentAccount[]> {
  const { onlyActive = true, excludePos = false, id } = opts;
  return scopeMemo(`accounts:${companyId}:${onlyActive}:${excludePos}:${id ?? ""}`, async () => {
    const rows = await bq<Omit<PaymentAccount, "createdAt" | "balanceSince"> & { createdAt: string; balanceSince: string }>(tx)`
      SELECT "id", "companyId", "kind"::text AS "kind", "bankKey", "bankName", "holder", "accountNumber", "docId", "note", "active",
             "createdAt", "currency", "openingCents", "linkedMethod"::text AS "linkedMethod", "balanceSince", "websiteUrl"
      FROM "PaymentAccount"
      WHERE "companyId" = ${companyId}
        ${onlyActive ? Prisma.sql`AND "active" = true` : Prisma.empty}
        ${excludePos ? Prisma.sql`AND "kind"::text <> 'PUNTO_DE_VENTA'` : Prisma.empty}
        ${id ? Prisma.sql`AND "id" = ${id}` : Prisma.empty}
      ORDER BY ${onlyActive ? Prisma.empty : Prisma.sql`"active" DESC,`} "createdAt" ASC
    `;
    return rows.map((r) => ({ ...r, createdAt: jsDate(r.createdAt), balanceSince: jsDate(r.balanceSince) })) as PaymentAccount[];
  });
}
