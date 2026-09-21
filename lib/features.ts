// Per-company custom features: a section or improvement built for ONE company
// that every other company must never see. The code for a feature ships with
// the app like anything else, but it only exists for a company whose
// Company.enabledFeatures (a platform admin toggles it from /admin) lists its
// id — a company that isn't listed can't see its nav link and is bounced from
// its pages (requireFeature, lib/session.ts).
//
// To add one: build its page(s) under app/, call `await requireFeature("<id>")`
// at the top of each page and server action, then register it here.
export type FeatureDef = {
  id: string;
  label: string;
  // Shown to the platform admin next to the toggle in /admin.
  description: string;
  // Top-level nav link for the company's users. Omit for a feature that only
  // changes behavior inside existing pages (check hasFeature() there).
  href?: string;
  // Hide the nav link from VENDEDOR accounts.
  managerOnly?: boolean;
};

export const FEATURES: FeatureDef[] = [];

const FEATURE_IDS = new Set(FEATURES.map((f) => f.id));

export function isKnownFeature(id: string): boolean {
  return FEATURE_IDS.has(id);
}

export function hasFeature(enabledFeatures: string[], id: string): boolean {
  return enabledFeatures.includes(id);
}
