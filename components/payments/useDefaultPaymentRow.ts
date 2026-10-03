"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { defaultPaymentSplitRows, type PaymentSplitRow } from "@/components/payments/PaymentSplitBuilder";

// Keeps the single default payment row in sync with the total as lines/costs
// are edited, so the common single-method case never requires retyping the
// amount. Once a second row exists (an intentional split) amounts are fully
// user-controlled and this leaves them alone.
//
// Runs while rendering rather than in an effect: React discards the render
// and re-runs it with the updated rows, so there is no frame showing the stale
// amount (and no cascading effect render). The first render counts as a change
// so the initial total is applied, exactly like the effect it replaces.
export function useDefaultPaymentRow(
  total: number,
  rate: number | null,
  exchangeRateEnabled: boolean,
  setRows: Dispatch<SetStateAction<PaymentSplitRow[]>>
) {
  const key = `${total}|${rate}|${exchangeRateEnabled}`;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (seenKey !== key) {
    setSeenKey(key);
    setRows((prev) => (prev.length === 1 ? defaultPaymentSplitRows(total, rate, exchangeRateEnabled) : prev));
  }
}
