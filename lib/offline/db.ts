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
  quoteId?: string;
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
      // Mobile Safari/iOS closes an open IndexedDB connection out from under
      // the page — silently, in the background, under memory pressure —
      // without the page ever calling db.close() itself. Without this, the
      // cached dbPromise above keeps resolving to that now-dead connection
      // forever, and every operation on it throws (see withDb's retry below
      // for the matching InvalidStateError/UnknownError this produced in
      // Sentry: KRPOS-8, KRPOS-9). Clearing the cache here just means the
      // next call opens a fresh connection instead of reusing a dead one.
      terminated() {
        dbPromise = null;
      },
    });
  }
  return dbPromise;
}

// Runs `op` against a fresh-enough connection, retrying once with a brand
// new connection if the cached one turns out to be dead — covers the case
// where the browser closed it without terminated() having fired yet (or at
// all; Safari's own close notifications are unreliable), which otherwise
// surfaces as the op itself throwing InvalidStateError/UnknownError.
async function withDb<T>(op: (db: IDBPDatabase) => Promise<T>, fallback: T): Promise<T> {
  const db = await getDb();
  if (!db) return fallback;
  try {
    return await op(db);
  } catch (err) {
    dbPromise = null;
    const retryDb = await getDb();
    if (!retryDb) return fallback;
    try {
      return await op(retryDb);
    } catch {
      // Still failing on a fresh connection — genuinely unavailable (e.g.
      // storage disabled), not just a stale handle. Offline queuing is
      // best-effort, so give up quietly rather than throwing into a caller
      // that's already treating this as "storage unavailable."
      console.error("[offline-db] operation failed after reconnect:", err);
      return fallback;
    }
  }
}

export async function addPendingSale(sale: PendingSale): Promise<void> {
  await withDb((db) => db.put(STORE_NAME, sale), undefined);
}

export async function listPendingSalesRaw(): Promise<PendingSale[]> {
  return withDb((db) => db.getAll(STORE_NAME), []);
}

export async function removePendingSale(localId: string): Promise<void> {
  await withDb((db) => db.delete(STORE_NAME, localId), undefined);
}

export async function setPendingSaleError(localId: string, error: string): Promise<void> {
  await withDb(async (db) => {
    const existing = await db.get(STORE_NAME, localId);
    if (existing) await db.put(STORE_NAME, { ...existing, lastError: error });
  }, undefined);
}
