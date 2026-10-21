/**
 * Amazon Ads (Sponsored Products) starter files for the Launch Kit.
 * Pure, no I/O, built from the Launch Kit's keywords and the royalty engine.
 *
 *   ads_keywords.csv  one row per keyword + match type, with a starting bid ceiling
 *   ads_guide.txt     campaign structure, paste-ready lists, break-even bid maths
 *
 * Bids are ceilings derived from the royalty, not predictions: at a given
 * conversion rate (sales per click), the highest cost-per-click that still
 * breaks even is royalty × conversion. Amazon's own suggested bid may be lower;
 * use whichever is lower.
 */

export type MatchType = "exact" | "phrase" | "broad" | "negative phrase";

export interface AdsKeywordRow {
  keyword: string;
  matchType: MatchType;
  adGroup: string;
  /** USD; null when no royalty is known (e.g. ebooks). */
  bid: number | null;
  source: "primary" | "long-tail" | "negative";
}

export const AD_GROUPS = {
  exact: "Exact - core keywords",
  phrase: "Phrase - core keywords",
  broad: "Broad - discovery",
  negative: "Negatives (add to every ad group)",
} as const;

/** Amazon Ads keyword limits for Sponsored Products: up to 10 words / 80 characters. */
const MAX_WORDS = 10;
const MAX_CHARS = 80;
/** Lowest Sponsored Products bid on amazon.com. */
const MIN_BID = 0.02;
/** Conversion rate used for the CSV bid ceiling (1 sale per 10 clicks). */
export const BASE_CONVERSION = 0.1;
const MATCH_FACTOR: Record<Exclude<MatchType, "negative phrase">, number> = { exact: 1, phrase: 0.8, broad: 0.6 };

/** Lowercase, strip characters Amazon Ads rejects, collapse spaces, enforce limits. */
export function normalizeAdKeyword(raw: string): string | null {
  const k = raw
    .toLowerCase()
    .replace(/[^a-z0-9&'\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!k || k.length > MAX_CHARS || k.split(" ").length > MAX_WORDS) return null;
  return k;
}

function uniqueKeywords(list: string[], seen: Set<string>): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const k = normalizeAdKeyword(raw);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/** Highest CPC that breaks even at a conversion rate, rounded down to the cent. */
export function breakEvenBid(royaltyUsd: number, conversion: number): number {
  return Math.floor(Math.max(0, royaltyUsd) * conversion * 100) / 100;
}

function bidFor(royaltyUsd: number | null, match: keyof typeof MATCH_FACTOR): number | null {
  if (royaltyUsd == null || royaltyUsd <= 0) return null;
  const b = Math.floor(royaltyUsd * BASE_CONVERSION * MATCH_FACTOR[match] * 100) / 100;
  return Math.max(MIN_BID, b);
}

const NEGATIVES_PRINT = ["free", "pdf", "printable", "kindle", "app"];
const NEGATIVES_EBOOK = ["free", "pdf", "printable", "paperback", "hardcover"];

export function buildAdsKeywords(opts: {
  primary: string[];
  longTail: string[];
  bookType: string;
  /** Royalty per sale on amazon.com in USD, or null if unknown. */
  royaltyUsd: number | null;
}): AdsKeywordRow[] {
  const seen = new Set<string>();
  const core = uniqueKeywords(opts.primary, seen);
  const discovery = uniqueKeywords(opts.longTail, seen);
  const rows: AdsKeywordRow[] = [];
  for (const k of core) rows.push({ keyword: k, matchType: "exact", adGroup: AD_GROUPS.exact, bid: bidFor(opts.royaltyUsd, "exact"), source: "primary" });
  for (const k of core) rows.push({ keyword: k, matchType: "phrase", adGroup: AD_GROUPS.phrase, bid: bidFor(opts.royaltyUsd, "phrase"), source: "primary" });
  for (const k of [...core, ...discovery]) {
    rows.push({ keyword: k, matchType: "broad", adGroup: AD_GROUPS.broad, bid: bidFor(opts.royaltyUsd, "broad"), source: core.includes(k) ? "primary" : "long-tail" });
  }
  // A negative must never block one of the book's own keywords.
  const positives = [...core, ...discovery];
  for (const n of opts.bookType === "ebook" ? NEGATIVES_EBOOK : NEGATIVES_PRINT) {
    if (positives.some((k) => k.split(" ").includes(n))) continue;
    rows.push({ keyword: n, matchType: "negative phrase", adGroup: AD_GROUPS.negative, bid: null, source: "negative" });
  }
  return rows;
}

const csvCell = (v: string): string => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** RFC 4180 CSV with a BOM so Excel opens it as UTF-8. */
export function adsKeywordsCsv(rows: AdsKeywordRow[]): string {
  const header = ["Keyword", "Match type", "Ad group", "Start bid ceiling (USD)", "Source"];
  const lines = [header, ...rows.map((r) => [r.keyword, r.matchType, r.adGroup, r.bid == null ? "" : r.bid.toFixed(2), r.source])];
  return "\uFEFF" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export function adsGuide(opts: {
  title: string;
  rows: AdsKeywordRow[];
  royaltyUsd: number | null;
  listPriceUsd: number | null;
}): string {
  const list = (group: string) => opts.rows.filter((r) => r.adGroup === group).map((r) => r.keyword);
  const exact = list(AD_GROUPS.exact);
  const broad = list(AD_GROUPS.broad);
  const negatives = list(AD_GROUPS.negative);

  const lines = [
    `AMAZON ADS STARTER — ${opts.title}`,
    "",
    "Start ads after the book is live and its page looks finished (cover, description, A+ Content).",
    "Amazon Ads: KDP Bookshelf → the book's \"...\" menu → Promote and Advertise → Create an ad campaign → Sponsored Products.",
    "",
    "SUGGESTED SETUP",
    "1. One Automatic campaign. Amazon finds searches for you; check its search-term report after 2 weeks.",
    "2. One Manual campaign with keyword targeting and three ad groups, as in ads_keywords.csv:",
    `   - ${AD_GROUPS.exact}: ${exact.length} keywords, exact match`,
    `   - ${AD_GROUPS.phrase}: the same keywords, phrase match`,
    `   - ${AD_GROUPS.broad}: ${broad.length} keywords, broad match`,
    "3. Add the negative keywords below to every ad group so you don't pay for clicks that rarely buy.",
    "4. Start with a small daily budget. Pause keywords that get many clicks and no sales.",
    "",
    "WHAT TO BID",
  ];

  if (opts.royaltyUsd != null && opts.royaltyUsd > 0) {
    lines.push(
      `You earn about $${opts.royaltyUsd.toFixed(2)} per sale on Amazon.com${opts.listPriceUsd ? ` at $${opts.listPriceUsd.toFixed(2)}` : ""}.`,
      "The most you can pay per click and still break even depends on how many clicks turn into a sale:",
      ...[0.05, 0.1, 0.15].map((c) => `   - 1 sale per ${Math.round(1 / c)} clicks (${Math.round(c * 100)}%): up to $${breakEvenBid(opts.royaltyUsd!, c).toFixed(2)} per click`),
      `The CSV bids use the 1-in-10 line: exact at 100%, phrase at 80%, broad at 60% of $${breakEvenBid(opts.royaltyUsd, BASE_CONVERSION).toFixed(2)}.`,
      "If Amazon suggests a lower bid, use Amazon's. These are ceilings, not targets.",
      "Ad spend also earns read-through: if the buyer comes back for Vol. 2, that sale had no ad cost."
    );
  } else {
    lines.push(
      "No royalty is set for this book, so the CSV has no bids.",
      "Break-even bid per click = your royalty per sale × the share of clicks that buy (e.g. $3.00 × 10% = $0.30)."
    );
  }

  lines.push(
    "",
    "PASTE-READY LISTS (Amazon Ads → Keyword targeting → Enter list, one per line)",
    "",
    "Exact + phrase:",
    ...exact,
    "",
    "Broad:",
    ...broad,
    "",
    "Negative phrase:",
    ...(negatives.length ? negatives : ["(none)"]),
    "",
    "Keywords are lowercased and trimmed to Amazon's limits (10 words, 80 characters). Results vary; nothing here guarantees sales."
  );
  return lines.join("\n");
}
