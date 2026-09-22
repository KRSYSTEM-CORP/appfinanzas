import { openDB, type IDBPDatabase } from "idb";
import type { PaymentMethod, PaymentStatus, Product, PrintPaperSize, ReferenceCurrency } from "@prisma/client";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";

const DB_NAME = "kyra-offline";
// v2 added the "catalog" store (see CatalogSnapshot below) — a purely
// additive change, upgrade() below only creates what's missing so existing
// queued sales in "pending-sales" are untouched.
const DB_VERSION = 2;
const STORE_NAME = "pending-sales";
const CATALOG_STORE_NAME = "catalog";

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

// A single snapshot per branch of everything /pos/offline needs to render a
// working POS screen with zero network — the full product catalog (already
// capped at 200 rows server-side, see listActiveProducts) plus every
// pricing/tax/branding setting normally fetched live by app/pos/page.tsx.
// Written by lib/offline/use-catalog-sync.ts every time the real /pos page
// renders successfully; read by PosOfflineClient. Kept as one denormalized
// document (not a per-product store with indexes) since 200 rows is trivial
// to filter/search with a plain JS array — no IndexedDB index machinery
// needed for this size.
export type CatalogSnapshot = {
  branchId: string;
  branchName: string | null;
  companyId: string;
  companyName: string;
  sellerName: string;
  savedAt: string;
  products: Product[];
  categories: string[];
  rate: number | null;
  currencyCode: string;
  exchangeRateEnabled: boolean;
  referenceCurrency: ReferenceCurrency;
  printPaperSize: PrintPaperSize;
  ivaGeneralRatePercent: number;
  ivaReducedRatePercent: number;
  company: DeliveryNoteCompany;
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
        if (!db.objectStoreNames.contains(CATALOG_STORE_NAME)) {
          db.createObjectStore(CATALOG_STORE_NAME, { keyPath: "branchId" });
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

// Best-effort, fire-and-forget like the rest of this file — a failed write
// just means the offline shell falls back to "no catalog saved yet" next
// time, not a user-facing error while online.
export async function putCatalogSnapshot(snapshot: CatalogSnapshot): Promise<void> {
  await withDb((db) => db.put(CATALOG_STORE_NAME, snapshot), undefined);
}

export async function getCatalogSnapshot(branchId: string): Promise<CatalogSnapshot | undefined> {
  return withDb((db) => db.get(CATALOG_STORE_NAME, branchId), undefined);
}
