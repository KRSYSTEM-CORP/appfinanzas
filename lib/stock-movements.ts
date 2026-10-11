import type { Prisma } from "@prisma/client";

export type StockMovementReason = "SALE" | "SALE_VOID" | "PURCHASE" | "PURCHASE_VOID" | "ADJUSTMENT" | "IMPORT";

export async function recordStockMovement(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    branchId: string;
    productId: string;
    productName: string;
    actorId: string | null;
    actorName: string;
    reason: StockMovementReason;
    sourceType?: string;
    sourceId?: string;
    quantityChange: number;
    stockBefore: number;
    stockAfter?: number;
  }
) {
  if (input.quantityChange === 0) return;
  await tx.stockMovement.create({
    data: {
      ...input,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      stockAfter: input.stockAfter ?? input.stockBefore + input.quantityChange,
    },
  });
}
