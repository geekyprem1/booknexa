/**
 * BookNexa funnel offers — single source of truth for the Front End + 6 OTOs.
 *
 * Payment is ALWAYS handled on launchpadjv (never in this app). Each offer's Buy
 * button links out to that offer's launchpadjv Direct Checkout Link
 * (`checkoutUrl`). Delivery is manual: when a sale comes in, an admin grants the
 * offer from the admin panel (Admin → Users → Grant offer), which merges the
 * offer's entitlements and grants its credits.
 *
 * This same list feeds:
 *   - the in-app Upgrade page (`app/dashboard/upgrade`)
 *   - the admin "Grant offer" picker (via `grantables()`)
 *
 * Each OTO can carry a `downsell` — the lite/cheaper offer shown on launchpadjv
 * when a buyer declines the main OTO. Downsells are separate grantables so the
 * admin can fulfill whichever one the buyer actually bought.
 *
 * Fill in each `checkoutUrl` (and downsell `checkoutUrl`) as its product is
 * configured on launchpadjv, and flip `featureReady` to true once the underlying
 * feature actually ships.
 */

import type { PlanKey } from "./billing/plans";

export type OfferKind = "front_end" | "oto";

export interface OfferVariant {
  label: string; // e.g. "Silver", "Gold"
  price: number; // USD
  credits: number;
  checkoutUrl: string | null; // launchpadjv Direct Checkout Link
}

export interface OfferDownsell {
  name: string;
  price: number; // USD
  credits: number;
  /** launchpadjv Direct Checkout Link for the downsell. */
  checkoutUrl: string | null;
  /** Admin-facing note on what the downsell delivers. */
  grants: string;
  /** Entitlements the downsell grants. Defaults to the parent offer's. */
  entitlements?: Record<string, boolean | string>;
}

export interface Offer {
  slug: string;
  /** Funnel position label, e.g. "Front End", "OTO1". */
  position: string;
  kind: OfferKind;
  name: string;
  tagline: string;
  /** Display price in USD. For multi-variant offers this is the entry price. */
  price: number;
  /** Credits granted on purchase (0 for library / static-kit offers). */
  credits: number;
  /** Human-readable delivery note for the admin doing the manual grant. */
  grants: string;
  /** launchpadjv Direct Checkout Link. null = not configured yet. */
  checkoutUrl: string | null;
  /** Optional priced variants (e.g. Silver / Gold). */
  variants?: OfferVariant[];
  /** Optional decline-path downsell. */
  downsell?: OfferDownsell;
  /** Is the underlying feature actually built & usable today? */
  featureReady: boolean;
  features: string[];
}

export const OFFERS: Offer[] = [
  {
    slug: "commercial",
    position: "Front End",
    kind: "front_end",
    name: "BookNexa Commercial",
    tagline: "AI se profitable KDP books minutes me — niche se cover tak, sab ek jagah.",
    price: 17,
    credits: 120,
    grants: "Starter plan + 120 credits",
    checkoutUrl: null,
    featureReady: true,
    features: [
      "Niche & opportunity research",
      "AI ebook + cover + title lab",
      "Commercial license · 120 credits to start",
    ],
  },
  {
    slug: "creator-suite",
    position: "OTO1",
    kind: "oto",
    name: "Creator Suite",
    tagline: "Saare premium engines ek saath — Coloring, Cover, Ebook, Crossword & Activity.",
    price: 37,
    credits: 600,
    grants: "600 credits (+ 5 premium engines unlocked)",
    checkoutUrl: null,
    downsell: {
      name: "Creator Suite Lite",
      price: 27,
      credits: 400,
      checkoutUrl: null,
      grants: "400 credits (+ premium engines unlocked)",
    },
    featureReady: true,
    features: [
      "Coloring Book + Cover Studio + Ebook Creator",
      "Crossword + Activity Book",
      "600 credits",
    ],
  },
  {
    slug: "unlimited",
    position: "OTO2",
    kind: "oto",
    name: "Unlimited Edition",
    tagline: "Saari limits hatao — har engine unlocked, credit-free generation, forever.",
    price: 67,
    credits: 2000,
    grants: "Unlimited entitlement (credit-free generation) + 2,000 buffer credits",
    checkoutUrl: null,
    downsell: {
      name: "Unlimited Lite",
      price: 47,
      credits: 1000,
      checkoutUrl: null,
      grants: "1,000 credits + all public engines except Cover V2 (metered, NOT unlimited)",
      // Lite = almost everything, but metered by credits (no `unlimited` flag) and
      // without the premium Cover V2 — that stays exclusive to full Unlimited.
      entitlements: {
        coloring: true, cover: true, ebook: true, crossword: true,
        activity: true, factory: true, autopilot: true,
      },
    },
    featureReady: true,
    features: [
      "Every public engine unlocked (20)",
      "No caps + credit-free generation",
      "Includes the DFY library",
    ],
  },
  {
    slug: "dfy",
    position: "OTO3",
    kind: "oto",
    name: "Done-For-You Edition",
    tagline: "Ready-to-publish books + proven niches — zero kaam, bas publish karo.",
    price: 67,
    credits: 0,
    grants: "DFY asset library access (no credits)",
    checkoutUrl: null,
    downsell: {
      name: "DFY Starter",
      price: 47,
      credits: 0,
      checkoutUrl: null,
      grants: "DFY asset library access (smaller starter set)",
    },
    featureReady: true,
    features: [
      "Ready-made, publish-ready book interiors",
      "Pre-made covers + proven niches",
      "Download & publish — zero credits used",
    ],
  },
  {
    slug: "autopilot",
    position: "OTO4",
    kind: "oto",
    name: "Autopilot / Automation",
    tagline: "Set-and-forget: niche → book → cover → publish-ready, hands-off.",
    price: 97,
    credits: 1500,
    grants: "1,500 credits (+ Autopilot & Factory access)",
    checkoutUrl: null,
    downsell: {
      name: "Autopilot Lite",
      price: 67,
      credits: 900,
      checkoutUrl: null,
      grants: "900 credits (+ Autopilot & Factory access)",
    },
    featureReady: true,
    features: [
      "Autopilot — auto niche, write, cover & package",
      "Profit Factory bulk queue",
      "1,500 credits",
    ],
  },
  {
    slug: "bundle-empire",
    position: "OTO5",
    kind: "oto",
    name: "Bundle & Series Empire",
    tagline: "Ek book ko poori series aur box-set me badlo — income multiply karo.",
    price: 47,
    credits: 800,
    grants: "800 credits (+ Bundle/Factory access)",
    checkoutUrl: null,
    downsell: {
      name: "Bundle Starter",
      price: 37,
      credits: 500,
      checkoutUrl: null,
      grants: "500 credits (+ Bundle/Factory access)",
    },
    featureReady: true,
    features: [
      "Bundle generator — box-sets & series",
      "Multi-book publish packages",
      "800 credits",
    ],
  },
  {
    slug: "agency",
    position: "OTO6",
    kind: "oto",
    name: "Agency / Client Edition",
    tagline: "Clients ke liye books banao aur becho — premium tools unlocked.",
    price: 97,
    credits: 1200,
    grants: "1,200 credits (+ agency: Cover, Ebook, Coloring unlocked)",
    checkoutUrl: null,
    downsell: {
      name: "Agency Lite",
      price: 67,
      credits: 800,
      checkoutUrl: null,
      grants: "800 credits (+ agency features)",
    },
    // Premium tools unlock instantly; client sub-accounts are set up manually by
    // support after purchase (interim, until multi-account ships).
    featureReady: true,
    features: [
      "Coloring + Premium Cover + Ebook unlocked",
      "Client workflow — set up by our team",
      "1,200 credits",
    ],
  },
  {
    slug: "reseller",
    position: "OTO7",
    kind: "oto",
    name: "Reseller / Whitelabel Edition",
    tagline: "BookNexa ko apne brand naam se becho — white-label branding.",
    price: 197,
    credits: 2500,
    grants: "2,500 credits (+ reseller + white-label)",
    checkoutUrl: null,
    downsell: {
      name: "Reseller Starter",
      price: 97,
      credits: 1500,
      checkoutUrl: null,
      grants: "1,500 credits (+ reseller + white-label)",
    },
    // Reseller pooling + white-label are set up manually by support after
    // purchase (interim, until multi-account ships).
    featureReady: true,
    features: [
      "White-label branding — set up by our team",
      "Reseller client accounts — set up by our team",
      "2,500 credits",
    ],
  },
];

/** All upsell offers (everything except the Front End). */
export const UPSELL_OFFERS = OFFERS.filter((o) => o.kind === "oto");

export function offerBySlug(slug: string): Offer | undefined {
  return OFFERS.find((o) => o.slug === slug);
}

// ── Delivery spec: what an offer actually grants when redeemed ──
// Kept as maps (not fields on each offer) so credits stay defined in one place.

/**
 * Feature flags an offer turns on beyond credits. Keys that match a `Feature`
 * name (coloring/cover/ebook/factory/autopilot) unlock that feature via
 * canUseFeature(); the rest (unlimited/dfy_assets/agency/reseller/white_label)
 * are entitlement-only, checked with hasEntitlement()/isUnlimited().
 */
const OFFER_ENTITLEMENTS: Record<string, Record<string, boolean | string>> = {
  "creator-suite": { coloring: true, cover: true, ebook: true, crossword: true, activity: true },
  unlimited: { unlimited: true },
  dfy: { dfy_assets: true },
  autopilot: { autopilot: true, factory: true },
  "bundle-empire": { factory: true },
  agency: { agency: true, cover: true, ebook: true, coloring: true },
  reseller: { reseller: true, white_label: true, cover: true, ebook: true, coloring: true },
};

/** Offers that also set the base plan tier (only the Front End does). */
const OFFER_PLAN: Record<string, PlanKey> = {
  commercial: "starter",
};

/** One redeemable line — an offer, a variant, or an offer's downsell. */
export interface Grantable {
  key: string; // offer slug, `slug:variant`, or `slug:downsell`
  offerSlug: string;
  label: string;
  credits: number;
  plan?: PlanKey;
  entitlements: Record<string, boolean | string>;
}

/** Flatten offers into the grantable list shown in the admin "Grant offer" picker. */
export function grantables(): Grantable[] {
  const out: Grantable[] = [];
  for (const o of OFFERS) {
    const entitlements = OFFER_ENTITLEMENTS[o.slug] ?? {};
    const plan = OFFER_PLAN[o.slug];

    if (o.variants?.length) {
      for (const v of o.variants) {
        out.push({
          key: `${o.slug}:${v.label.toLowerCase()}`,
          offerSlug: o.slug,
          label: `${o.position} · ${o.name} — ${v.label}`,
          credits: v.credits,
          plan,
          entitlements,
        });
      }
    } else {
      out.push({
        key: o.slug,
        offerSlug: o.slug,
        label: `${o.position} · ${o.name}`,
        credits: o.credits,
        plan,
        entitlements,
      });
    }

    // Downsell as its own redeemable line.
    if (o.downsell) {
      out.push({
        key: `${o.slug}:downsell`,
        offerSlug: o.slug,
        label: `${o.position} · ${o.name} — ${o.downsell.name} (downsell)`,
        credits: o.downsell.credits,
        plan,
        entitlements: o.downsell.entitlements ?? entitlements,
      });
    }
  }
  return out;
}

export function grantableByKey(key: string): Grantable | undefined {
  return grantables().find((g) => g.key === key);
}
