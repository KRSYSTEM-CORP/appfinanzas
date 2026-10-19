import { Prisma } from "@prisma/client";

// Each document sequence: the Branch counter column and the column/table it
// numbers. Whitelisted here — never built from user input.
const SEQUENCES = {
  sale: { counter: "nextSaleNumber", table: "Sale", column: "controlNumber" },
  receipt: { counter: "nextReceiptNumber", table: "Sale", column: "receiptControlNumber" },
  invoice: { counter: "nextInvoiceNumber", table: "Sale", column: "invoiceNumber" },
  quote: { counter: "nextQuoteNumber", table: "Quote", column: "controlNumber" },
  purchase: { counter: "nextPurchaseNumber", table: "Purchase", column: "controlNumber" },
  creditNote: { counter: "nextCreditNoteNumber", table: "CreditNote", column: "controlNumber" },
  debitNote: { counter: "nextDebitNoteNumber", table: "DebitNote", column: "controlNumber" },
} as const;

export type DocumentSequence = keyof typeof SEQUENCES;

// Hands out the next number of a branch's document sequence (audit
// KRPOS-DB-001). The UPDATE locks the branch row, so concurrent registers
// serialize here; GREATEST() with the current MAX self-heals a counter that
// fell behind (e.g. rows written by an older deploy) instead of colliding
// with the @@unique([branchId, ...]) constraint. Numbers are never reused,
// even after a document is deleted.
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  branchId: string,
  sequence: DocumentSequence
): Promise<number> {
  const { counter, table, column } = SEQUENCES[sequence];
  const rows = await tx.$queryRaw<{ n: number }[]>(Prisma.sql`
    UPDATE "Branch" SET ${Prisma.raw(`"${counter}"`)} = GREATEST(
      ${Prisma.raw(`"${counter}"`)},
      COALESCE((SELECT MAX(${Prisma.raw(`"${column}"`)}) FROM ${Prisma.raw(`"${table}"`)} WHERE "branchId" = ${branchId}), 0)
    ) + 1
    WHERE "id" = ${branchId}
    RETURNING ${Prisma.raw(`"${counter}"`)} AS n
  `);
  const n = rows[0]?.n;
  if (n == null) throw new Error("Sucursal no encontrada para asignar el correlativo");
  return Number(n);
}
