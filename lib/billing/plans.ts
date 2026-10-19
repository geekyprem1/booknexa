/**
 * BookNexa plans + feature gating. Plans and features are provider-agnostic —
 * payment processors never appear here.
 */

export type PlanKey = "free" | "starter" | "pro" | "publisher" | "factory" | "agency";

export type Feature =
  | "market_intelligence"
  | "title_optimizer"
  | "word_search"
  | "sudoku"
  | "maze"
  | "launch_kit"
  | "coloring"
  | "cover"
  | "cover_v2"
  | "ebook"
  | "storybook"
  | "lowcontent"
  | "tracing"
  | "math"
  | "scramble"
  | "cryptogram"
  | "dot_to_dot"
  | "crossword"
  | "activity"
  | "factory"
  | "autopilot";

export interface Plan {
  key: PlanKey;
  name: string;
  price: number; // USD, 0 for free
  type: "free" | "one_time" | "subscription";
  monthlyCredits: number;
  tier: number; // higher unlocks more
  blurb: string;
}

export const PLANS: Record<PlanKey, Plan> = {
  free: { key: "free", name: "Free Trial", price: 0, type: "free", monthlyCredits: 0, tier: 1, blurb: "Try the core generators" },
  starter: { key: "starter", name: "BookNexa", price: 17, type: "one_time", monthlyCredits: 120, tier: 1, blurb: "Front End — Word Search, Sudoku, Maze, Launch Kit" },
  pro: { key: "pro", name: "BookNexa Pro", price: 37, type: "one_time", monthlyCredits: 300, tier: 2, blurb: "Coloring books + premium covers" },
  publisher: { key: "publisher", name: "BookNexa Publisher", price: 67, type: "one_time", monthlyCredits: 1000, tier: 3, blurb: "Ebooks + multi-format export" },
  factory: { key: "factory", name: "BookNexa Factory", price: 97, type: "one_time", monthlyCredits: 2500, tier: 4, blurb: "Bulk + bundle production" },
  agency: { key: "agency", name: "BookNexa Agency", price: 197, type: "one_time", monthlyCredits: 5000, tier: 5, blurb: "Unlimited projects, priority queue" },
};

export const PLAN_ORDER: PlanKey[] = ["free", "starter", "pro", "publisher", "factory", "agency"];

/** Minimum plan tier required to use each feature. */
export const FEATURE_TIER: Record<Feature, number> = {
  market_intelligence: 1,
  title_optimizer: 1,
  word_search: 1,
  sudoku: 1,
  maze: 1,
  launch_kit: 1,
  // Low-content + kids workbooks + algorithmic puzzles — front-end volume products.
  lowcontent: 1,
  tracing: 1,
  math: 1,
  scramble: 1,
  cryptogram: 1,
  dot_to_dot: 1,
  crossword: 2,
  // Mixed activity book — a richer compiled product.
  activity: 2,
  coloring: 2,
  cover: 2,
  ebook: 3,
  // Story Book Creator (image-heavy, character-consistent picture books) sold as
  // a Publisher-tier OTO. Any offer granting the storybook entitlement unlocks it.
  storybook: 3,
  factory: 4,
  // Autopilot writes 3 full ebooks per run — bulk production, same tier as
  // the Profit Factory.
  autopilot: 4,
  // Cover Generator V2 is Beta and costs an order of magnitude more per cover than
  // V1, so it sits at the top tier. Any offer that grants the cover_v2 entitlement
  // unlocks it without a tier change.
  cover_v2: 5,
};

export function planByKey(key: string | null | undefined): Plan {
  return PLANS[(key as PlanKey) ?? "free"] ?? PLANS.free;
}

/** Map a plan_name (as stored on a subscription) back to its key. */
export function planKeyFromName(name: string): PlanKey {
  const found = PLAN_ORDER.find((k) => PLANS[k].name === name);
  return found ?? "free";
}

/**
 * The "Unlimited" OTO — a meta-entitlement that unlocks every feature and makes
 * generation free (credit checks are bypassed). Checked here and in the credit
 * ledger's reserve(). Any other truthy value ("lite") counts too — the downsell
 * is still an unlimited grant, just with a smaller goodwill credit buffer.
 */
export function isUnlimited(entitlements?: Record<string, boolean | string> | null): boolean {
  return Boolean(entitlements && entitlements.unlimited);
}

/**
 * Entitlement-only gate for features that don't sit on the plan tier ladder
 * (dfy_assets, agency, reseller, white_label, …). Unlimited implies all of them.
 */
export function hasEntitlement(
  entitlements: Record<string, boolean | string> | null | undefined,
  key: string
): boolean {
  if (isUnlimited(entitlements)) return true;
  return Boolean(entitlements && entitlements[key]);
}

/**
 * Features that are NOT part of any plan/OTO and never unlocked by entitlements or
 * Unlimited — they are internal, admin-only tools (gated by an admin check in
 * their route, not by billing). Story Book is admin-only because its per-book
 * image cost is the highest of any engine.
 */
export const ADMIN_ONLY_FEATURES = new Set<Feature>(["storybook"]);

/**
 * Feature access = the Unlimited OTO is owned, OR an owned entitlement flips the
 * feature on directly (an OTO that unlocks it), OR the plan tier is high enough.
 * Admin-only features are never granted here.
 */
export function canUseFeature(
  planKey: PlanKey,
  feature: Feature,
  entitlements?: Record<string, boolean | string> | null
): boolean {
  if (ADMIN_ONLY_FEATURES.has(feature)) return false;
  if (isUnlimited(entitlements)) return true;
  if (entitlements && entitlements[feature] === true) return true;
  return PLANS[planKey].tier >= FEATURE_TIER[feature];
}

/** The lowest plan that unlocks a feature (for upgrade prompts). */
export function requiredPlanFor(feature: Feature): Plan {
  const tier = FEATURE_TIER[feature];
  const key = PLAN_ORDER.find((k) => PLANS[k].tier >= tier && PLANS[k].type !== "free") ?? "pro";
  return PLANS[key];
}
