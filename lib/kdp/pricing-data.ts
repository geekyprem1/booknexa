/**
 * Amazon KDP paperback pricing data: black ink on white or cream paper.
 *
 * Sources (fetched Oct 2026, re-verify every quarter and bump VERIFIED_AT):
 *   - Printing cost: https://kdp.amazon.com/en_US/help/topic/G201834340
 *   - Royalty rates: https://kdp.amazon.com/en_US/help/topic/G201834330
 *
 * Printing cost = fixed cost (+ page count × per-page cost above the fixed-only band).
 * Royalty       = rate × list price − printing cost, where the rate is 60% at or
 *                 above the marketplace threshold and 50% below it. Expanded
 *                 Distribution pays 40%.
 * "Large" trim  = wider than 6.12" or taller than 9".
 *
 * Color ink, groundwood paper and hardcover are not covered yet.
 */

export const VERIFIED_AT = "2026-10-21";

export type MarketplaceId = "com" | "ca" | "uk" | "eu" | "pl" | "se" | "au" | "jp";

export interface CostPair {
  regular: number;
  large: number;
}

export interface Marketplace {
  id: MarketplaceId;
  label: string;
  /** Amazon storefront(s) this row applies to. */
  domains: string[];
  currency: string;
  symbol: string;
  /** Minor-unit digits (JPY has none). */
  decimals: 0 | 2;
  /** Lowest list price that earns the 60% rate. */
  threshold60: number;
  maxPrice: number;
  /** Books up to this page count pay only the fixed cost. */
  fixedOnlyMaxPages: number;
  /** Fixed-only cost for short books. */
  shortFixed: CostPair;
  /** Fixed part of the cost for longer books. */
  longFixed: CostPair;
  /** Per-page part of the cost for longer books. */
  perPage: CostPair;
}

export const MARKETPLACES: Record<MarketplaceId, Marketplace> = {
  com: {
    id: "com", label: "United States", domains: ["amazon.com"], currency: "USD", symbol: "$", decimals: 2,
    threshold60: 9.99, maxPrice: 250, fixedOnlyMaxPages: 110,
    shortFixed: { regular: 2.30, large: 2.84 }, longFixed: { regular: 1.00, large: 1.00 }, perPage: { regular: 0.012, large: 0.017 },
  },
  ca: {
    id: "ca", label: "Canada", domains: ["amazon.ca"], currency: "CAD", symbol: "CA$", decimals: 2,
    threshold60: 13.99, maxPrice: 350, fixedOnlyMaxPages: 110,
    shortFixed: { regular: 2.99, large: 3.53 }, longFixed: { regular: 1.26, large: 1.26 }, perPage: { regular: 0.016, large: 0.021 },
  },
  uk: {
    id: "uk", label: "United Kingdom", domains: ["amazon.co.uk"], currency: "GBP", symbol: "£", decimals: 2,
    threshold60: 7.99, maxPrice: 250, fixedOnlyMaxPages: 110,
    shortFixed: { regular: 1.93, large: 2.15 }, longFixed: { regular: 0.85, large: 0.85 }, perPage: { regular: 0.010, large: 0.012 },
  },
  eu: {
    id: "eu", label: "Europe (DE, FR, IT, ES, NL, IE, BE)",
    domains: ["amazon.de", "amazon.fr", "amazon.it", "amazon.es", "amazon.nl", "amazon.ie", "amazon.com.be"],
    currency: "EUR", symbol: "€", decimals: 2,
    threshold60: 9.99, maxPrice: 250, fixedOnlyMaxPages: 110,
    shortFixed: { regular: 2.05, large: 2.48 }, longFixed: { regular: 0.75, large: 0.75 }, perPage: { regular: 0.012, large: 0.016 },
  },
  pl: {
    id: "pl", label: "Poland", domains: ["amazon.pl"], currency: "PLN", symbol: "zł", decimals: 2,
    threshold60: 40, maxPrice: 1200, fixedOnlyMaxPages: 110,
    shortFixed: { regular: 9.58, large: 11.61 }, longFixed: { regular: 3.51, large: 3.51 }, perPage: { regular: 0.056, large: 0.075 },
  },
  se: {
    id: "se", label: "Sweden", domains: ["amazon.se"], currency: "SEK", symbol: "kr", decimals: 2,
    threshold60: 110, maxPrice: 2500, fixedOnlyMaxPages: 110,
    shortFixed: { regular: 22.84, large: 27.67 }, longFixed: { regular: 8.37, large: 8.37 }, perPage: { regular: 0.134, large: 0.179 },
  },
  au: {
    id: "au", label: "Australia", domains: ["amazon.com.au"], currency: "AUD", symbol: "A$", decimals: 2,
    threshold60: 13.99, maxPrice: 350, fixedOnlyMaxPages: 108,
    shortFixed: { regular: 4.74, large: 5.28 }, longFixed: { regular: 2.42, large: 2.42 }, perPage: { regular: 0.022, large: 0.027 },
  },
  jp: {
    id: "jp", label: "Japan", domains: ["amazon.co.jp"], currency: "JPY", symbol: "¥", decimals: 0,
    threshold60: 1000, maxPrice: 30000, fixedOnlyMaxPages: 110,
    shortFixed: { regular: 422, large: 530 }, longFixed: { regular: 206, large: 206 }, perPage: { regular: 2, large: 3 },
  },
};

export const MARKETPLACE_ORDER: MarketplaceId[] = ["com", "uk", "eu", "ca", "au", "jp", "pl", "se"];

/** KDP paperback page-count limits (black ink, white paper). */
export const MIN_PAPERBACK_PAGES = 24;
export const MAX_PAPERBACK_PAGES = 828;

/** Width/height cut-offs above which a trim counts as "large" for printing cost. */
export const LARGE_TRIM_MAX_WIDTH_IN = 6.12;
export const LARGE_TRIM_MAX_HEIGHT_IN = 9;
