const GRACE_DAYS = 5;

// Fixed id of the single PlatformSettings row (global config, not per-company).
export const PLATFORM_SETTINGS_ID = "platform";

export type BillingCompany = {
  isExempt: boolean;
  nextPaymentDueDate: Date | null;
};

// Computed live from the due date — no cron/background job needed. A company
// with no billing cycle configured yet (nextPaymentDueDate null) is treated
// as not blocked, since that's the state right after signup before a
// platform admin has approved and set up their first cycle.
export function isCompanyBlocked(company: BillingCompany): boolean {
  if (company.isExempt || !company.nextPaymentDueDate) return false;
  const graceDeadline = new Date(company.nextPaymentDueDate);
  graceDeadline.setDate(graceDeadline.getDate() + GRACE_DAYS);
  return new Date() > graceDeadline;
}
