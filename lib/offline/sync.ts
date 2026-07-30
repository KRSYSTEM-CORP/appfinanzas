import { completeSale } from "@/lib/actions/sales";
import {
  addPendingSale,
  listPendingSalesRaw,
  removePendingSale,
  setPendingSaleError,
  type PendingSale,
  type PendingSaleInput,
  type PendingSalePreview,
} from "@/lib/offline/db";

export type { PendingSale, PendingSaleInput, PendingSalePreview };

export async function queueSale(input: PendingSaleInput, preview: PendingSalePreview): Promise<PendingSale> {
  const sale: PendingSale = {
    localId: crypto.randomUUID(),
    queuedAt: new Date().toISOString(),
    input,
    preview,
  };
  await addPendingSale(sale);
  return sale;
}

export async function listPendingSales(): Promise<PendingSale[]> {
  const rows = await listPendingSalesRaw();
  return rows.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
}

export type SyncResult = { synced: number; remaining: number };

// Best-effort: submits every queued sale in order through the real
// completeSale() action. A success removes it from the queue; a failure
// (e.g. stock ran out while offline, since another device sold it in the
// meantime) leaves it queued with its error message attached so the seller
// can resolve it by hand rather than losing the sale silently.
export async function syncPendingSales(): Promise<SyncResult> {
  const pending = await listPendingSales();
  let synced = 0;
  for (const sale of pending) {
    try {
      const result = await completeSale(sale.input);
      if (result.success) {
        await removePendingSale(sale.localId);
        synced++;
      } else {
        await setPendingSaleError(sale.localId, result.error);
      }
    } catch {
      await setPendingSaleError(sale.localId, "Sin conexión — se reintentará más tarde.");
    }
  }
  const remaining = (await listPendingSales()).length;
  return { synced, remaining };
}
