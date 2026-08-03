import { openDB, type IDBPDatabase } from "idb";
import type { PaymentMethod, PaymentStatus } from "@prisma/client";

const DB_NAME = "kyra-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending-sales";

// The exact shape completeSale() expects — kept separate from
// PaymentSplitRow (which carries the raw text amount) so a queued sale
// re-submits identically to what an online checkout would have sent.
export type PendingSaleInput = {
  items: { productId: string; quantity: number }[];
  paymentStatus: PaymentStatus;
  payments: {
    paymentMethod: PaymentMethod;
    amount: string;
    paidInForeignCurrency: boolean;
    reference: string;
  }[];
  discountPercent: number;
  customerFirstName: string;
  customerLastName: string;
  customerPhone: string;
  customerAddress: string;
  customerRif?: string;
  note?: string;
};

// Enough to render a "pending" receipt immediately, before the real Sale
// exists server-side — see components/pos/PosClient.tsx.
export type PendingSalePreview = {
  totalCents: number;
  items: {
    productName: string;
    category?: string | null;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
  }[];
  sellerName: string | null;
  note: string | null;
};

export type PendingSale = {
  localId: string;
  queuedAt: string;
  input: PendingSaleInput;
  preview: PendingSalePreview;
  lastError?: string;
};

let dbPromise: Promise<IDBPDatabase> | null = null;

// IndexedDB doesn't exist during SSR/build, and in principle a browser could
// lack it too (private-mode restrictions on some old browsers) — every
// caller treats a null db as "offline storage unavailable" rather than
// throwing, since queuing is a best-effort convenience, not the sale itself.
function getDb(): Promise<IDBPDatabase> | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "localId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function addPendingSale(sale: PendingSale): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.put(STORE_NAME, sale);
}

export async function listPendingSalesRaw(): Promise<PendingSale[]> {
  const db = await getDb();
  if (!db) return [];
  return db.getAll(STORE_NAME);
}

export async function removePendingSale(localId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(STORE_NAME, localId);
}

export async function setPendingSaleError(localId: string, error: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db.get(STORE_NAME, localId);
  if (existing) await db.put(STORE_NAME, { ...existing, lastError: error });
}
