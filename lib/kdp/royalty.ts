/**
 * KDP paperback printing cost + royalty math. Pure, no I/O — safe in client
 * components (the calculator runs in the browser).
 *
 * Money is computed in integer micro-units (major × 1,000,000) so decimal
 * per-page costs like $0.012 never pick up float drift, then rounded to the
 * currency's minor unit (cents, or whole yen) the way KDP displays it.
 */

import {
  LARGE_TRIM_MAX_HEIGHT_IN,
  LARGE_TRIM_MAX_WIDTH_IN,
  MARKETPLACE_ORDER,
  MARKETPLACES,
  MAX_PAPERBACK_PAGES,
  MIN_PAPERBACK_PAGES,
  type Marketplace,
  type MarketplaceId,
} from "./pricing-data";

export interface TrimLike {
  widthIn: number;
  heightIn: number;
}

const MICRO = 1_000_000;
const toMicro = (major: number): number => Math.round(major * MICRO);
const minorStep = (m: Marketplace): number => MICRO / 10 ** m.decimals; // micro per cent / yen
const roundMinor = (micro: number, m: Marketplace): number => Math.round(micro / minorStep(m)) * minorStep(m);
const ceilMinor = (micro: number, m: Marketplace): number => Math.ceil(micro / minorStep(m) - 1e-9) * minorStep(m);
const toMajor = (micro: number, m: Marketplace): number => Number((micro / MICRO).toFixed(m.decimals));

export function isLargeTrim(trim: TrimLike): boolean {
  return trim.widthIn > LARGE_TRIM_MAX_WIDTH_IN || trim.heightIn > LARGE_TRIM_MAX_HEIGHT_IN;
}

/** Clamp to KDP's paperback page range (24–828) and an integer. */
export function normalizePages(pages: number): number {
  if (!Number.isFinite(pages)) return MIN_PAPERBACK_PAGES;
  return Math.min(MAX_PAPERBACK_PAGES, Math.max(MIN_PAPERBACK_PAGES, Math.round(pages)));
}

function printingCostMicro(m: Marketplace, trim: TrimLike, pages: number): number {
  const size = isLargeTrim(trim) ? "large" : "regular";
  const p = normalizePages(pages);
  const raw =
    p <= m.fixedOnlyMaxPages
      ? toMicro(m.shortFixed[size])
      : toMicro(m.longFixed[size]) + p * toMicro(m.perPage[size]);
  return roundMinor(raw, m);
}

/** KDP printing cost in the marketplace currency. */
export function printingCost(mkt: MarketplaceId, trim: TrimLike, pages: number): number {
  const m = MARKETPLACES[mkt];
  return toMajor(printingCostMicro(m, trim, pages), m);
}

/** 60% at/above the marketplace threshold, 50% below. */
export function royaltyRate(mkt: MarketplaceId, listPrice: number): 0.5 | 0.6 {
  const m = MARKETPLACES[mkt];
  return toMicro(listPrice) >= toMicro(m.threshold60) ? 0.6 : 0.5;
}

export interface RoyaltyBreakdown {
  marketplace: MarketplaceId;
  currency: string;
  listPrice: number;
  rate: number;
  printingCost: number;
  royalty: number;
  /** True when the price is below KDP's minimum (royalty would be ≤ 0 or rejected). */
  belowMinimum: boolean;
}

/** Royalty per sale. `expanded` = Expanded Distribution (40%, no 50/60 split). */
export function royalty(
  mkt: MarketplaceId,
  trim: TrimLike,
  pages: number,
  listPrice: number,
  opts: { expanded?: boolean } = {}
): RoyaltyBreakdown {
  const m = MARKETPLACES[mkt];
  const price = toMicro(listPrice);
  const cost = printingCostMicro(m, trim, pages);
  const ratePct = opts.expanded ? 40 : royaltyRate(mkt, listPrice) === 0.6 ? 60 : 50;
  const earned = roundMinor((price * ratePct) / 100 - cost, m);
  return {
    marketplace: mkt,
    currency: m.currency,
    listPrice: toMajor(price, m),
    rate: ratePct / 100,
    printingCost: toMajor(cost, m),
    royalty: toMajor(earned, m),
    belowMinimum: price < minListPriceMicro(m, trim, pages),
  };
}

function minListPriceMicro(m: Marketplace, trim: TrimLike, pages: number): number {
  const cost = printingCostMicro(m, trim, pages);
  const threshold = toMicro(m.threshold60);
  const at50 = ceilMinor(cost * 2, m); // cost / 0.5
  if (at50 < threshold) return at50;
  // Too expensive to print for the 50% band: the price must sit in the 60% band.
  return Math.max(threshold, ceilMinor((cost * 10) / 6, m)); // cost / 0.6
}

/** Lowest list price KDP accepts for this book (royalty covers printing). */
export function minListPrice(mkt: MarketplaceId, trim: TrimLike, pages: number): number {
  const m = MARKETPLACES[mkt];
  return toMajor(minListPriceMicro(m, trim, pages), m);
}

/** Round up to a "charm" price: x.99 for decimal currencies, a multiple of 10 for JPY. */
function charmUp(micro: number, m: Marketplace): number {
  if (m.decimals === 0) return Math.ceil(micro / (10 * MICRO) - 1e-9) * 10 * MICRO;
  const whole = Math.floor(micro / MICRO);
  const charm = whole * MICRO + 990_000;
  return charm >= micro ? charm : charm + MICRO;
}

export interface PriceRecommendation extends RoyaltyBreakdown {
  reason: string;
}

/**
 * The lowest price in the 60% band (e.g. $9.99, £7.99, €9.99). Any 50%-band
 * price earns less than this, because 60% of the threshold beats 50% of
 * anything below it. If printing pushes the minimum higher, use the next
 * charm price above the minimum.
 */
export function recommendPrice(mkt: MarketplaceId, trim: TrimLike, pages: number): PriceRecommendation {
  const m = MARKETPLACES[mkt];
  const min = minListPriceMicro(m, trim, pages);
  const threshold = toMicro(m.threshold60);
  const raw = min <= threshold ? threshold : charmUp(min, m);
  const price = Math.min(raw, toMicro(m.maxPrice));
  const breakdown = royalty(mkt, trim, pages, toMajor(price, m));
  const reason =
    price === threshold
      ? `Lowest price that earns KDP's 60% royalty on ${m.domains[0]}.`
      : `Printing cost puts KDP's minimum at ${formatMoney(mkt, toMajor(min, m))}; this is the next round price above it.`;
  return { ...breakdown, reason };
}

/** Recommendation for every marketplace, in display order. */
export function recommendAll(trim: TrimLike, pages: number): PriceRecommendation[] {
  return MARKETPLACE_ORDER.map((id) => recommendPrice(id, trim, pages));
}

export function formatMoney(mkt: MarketplaceId, amount: number): string {
  const m = MARKETPLACES[mkt];
  const n = amount.toFixed(m.decimals);
  return m.symbol.length === 1 || m.symbol.endsWith("$") ? `${m.symbol}${n}` : `${n} ${m.symbol}`;
}
