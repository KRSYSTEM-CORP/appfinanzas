"use client";

import { useEffect } from "react";
import type { Product, PrintPaperSize, ReferenceCurrency } from "@prisma/client";
import type { DeliveryNoteCompany } from "@/lib/delivery-note";
import { putCatalogSnapshot, type CatalogSnapshot } from "@/lib/offline/db";

// Read synchronously (before any IndexedDB round-trip) by PosOfflineClient
// so it knows WHICH branch's snapshot to look up without an async lookup
// first — IndexedDB's own catalog store is keyed by branchId, so something
// has to say which branchId to ask for before that query can even run.
const LAST_BRANCH_KEY = "kr-pos-last-branch";

export type LastBranchInfo = { branchId: string; branchName: string | null; companyName: string };

export function readLastBranch(): LastBranchInfo | null {
  try {
    const raw = localStorage.getItem(LAST_BRANCH_KEY);
    return raw ? (JSON.parse(raw) as LastBranchInfo) : null;
  } catch {
    return null;
  }
}

function writeLastBranch(info: LastBranchInfo) {
  try {
    localStorage.setItem(LAST_BRANCH_KEY, JSON.stringify(info));
  } catch {
    // Best-effort — a missing localStorage entry just means the offline
    // shell shows its "no catalog saved yet" state, not a crash.
  }
}

// Keeps IndexedDB's catalog snapshot for this branch warm every time the
// real (online) /pos page renders with fresh server props — see
// components/pos/PosClient.tsx. Fires on mount and again whenever `products`
// (or any other snapshot input) actually changes reference, which only
// happens when the page re-fetches from the server (initial load, or a
// router.refresh() from useLiveRefresh) — NOT on every local cart edit,
// since those never touch these prop references. Best-effort, no loading
// state or error surfaced to the user, same posture as queueSale.
export function useCatalogSync(params: {
  branchId: string | null;
  branchName: string | null;
  companyId: string;
  companyName: string;
  sellerName: string;
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
}) {
  const { branchId, branchName, companyId, companyName, sellerName, products, categories } = params;
  useEffect(() => {
    // No offline shell without a concrete branch — matches requireBranchId's
    // own rule that a sale needs one specific branch, never "todas las
    // sucursales" (only possible for a GERENTE), so there's nothing useful
    // to cache in that case.
    if (!branchId) return;
    const snapshot: CatalogSnapshot = {
      branchId,
      branchName,
      companyId,
      companyName,
      sellerName,
      savedAt: new Date().toISOString(),
      products,
      categories,
      rate: params.rate,
      currencyCode: params.currencyCode,
      exchangeRateEnabled: params.exchangeRateEnabled,
      referenceCurrency: params.referenceCurrency,
      printPaperSize: params.printPaperSize,
      ivaGeneralRatePercent: params.ivaGeneralRatePercent,
      ivaReducedRatePercent: params.ivaReducedRatePercent,
      company: params.company,
    };
    putCatalogSnapshot(snapshot);
    writeLastBranch({ branchId, branchName, companyName });
    // Only the values that actually identify "the data changed" are worth
    // depending on — params.rate/categories/etc. all change in lockstep with
    // `products` (same server render), so re-listing every field here would
    // just be noise for the linter without changing behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, branchName, companyId, companyName, sellerName, products, categories]);
}
