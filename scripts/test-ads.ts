/**
 * Amazon Ads keyword sheet suite.
 *
 *   npm run test:ads
 *
 * Covers keyword normalization + limits, de-duplication across match types,
 * bid ceilings from the royalty, negatives that never block the book's own
 * keywords, CSV escaping, and the Launch Kit wiring.
 */

import assert from "node:assert/strict";
import { adsGuide, adsKeywordsCsv, breakEvenBid, buildAdsKeywords, normalizeAdKeyword } from "../lib/publishing/ads";
import { packageFiles, type PackageData, type PublishContext } from "../lib/publishing/package";
import { buildMetadataJson } from "../lib/publishing/metadata";

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("── Ads keyword suite ───────────────────────────");

test("normalize: lowercase, strip odd characters, enforce 10 words / 80 chars", () => {
  assert.equal(normalizeAdKeyword("  Large Print WORD Search!!  "), "large print word search");
  assert.equal(normalizeAdKeyword("kids' puzzles & games"), "kids' puzzles & games");
  assert.equal(normalizeAdKeyword("one two three four five six seven eight nine ten eleven"), null);
  assert.equal(normalizeAdKeyword("x".repeat(81)), null);
  assert.equal(normalizeAdKeyword("   "), null);
});

test("break-even bid = royalty × conversion, rounded down to the cent", () => {
  assert.equal(breakEvenBid(3.15, 0.1), 0.31);
  assert.equal(breakEvenBid(3.15, 0.05), 0.15);
  assert.equal(breakEvenBid(-1, 0.1), 0);
});

const rows = buildAdsKeywords({
  primary: ["Sudoku for Adults", "large print sudoku", "sudoku for adults"],
  longTail: ["Sudoku for adults", "medium sudoku puzzle book with solutions", "printable sudoku"],
  bookType: "sudoku",
  royaltyUsd: 3.15,
});

test("core keywords get exact + phrase + broad, long-tail only broad, no duplicates", () => {
  const by = (m: string) => rows.filter((r) => r.matchType === m).map((r) => r.keyword);
  assert.deepEqual(by("exact"), ["sudoku for adults", "large print sudoku"]);
  assert.deepEqual(by("phrase"), ["sudoku for adults", "large print sudoku"]);
  assert.deepEqual(by("broad"), ["sudoku for adults", "large print sudoku", "medium sudoku puzzle book with solutions", "printable sudoku"]);
});

test("bids: exact 100%, phrase 80%, broad 60% of the 1-in-10 break-even", () => {
  assert.equal(rows.find((r) => r.matchType === "exact")?.bid, 0.31);
  assert.equal(rows.find((r) => r.matchType === "phrase")?.bid, 0.25);
  assert.equal(rows.find((r) => r.matchType === "broad")?.bid, 0.18);
  const cheap = buildAdsKeywords({ primary: ["a b"], longTail: [], bookType: "maze", royaltyUsd: 0.1 });
  assert.equal(cheap[0].bid, 0.02); // Amazon's minimum
  const ebook = buildAdsKeywords({ primary: ["a b"], longTail: [], bookType: "ebook", royaltyUsd: null });
  assert.equal(ebook[0].bid, null);
});

test("negatives skip words the book itself targets", () => {
  const negs = rows.filter((r) => r.matchType === "negative phrase").map((r) => r.keyword);
  assert.ok(negs.includes("free") && negs.includes("pdf"));
  assert.ok(!negs.includes("printable")); // "printable sudoku" is one of our keywords
  const ebookNegs = buildAdsKeywords({ primary: ["x y"], longTail: [], bookType: "ebook", royaltyUsd: null })
    .filter((r) => r.matchType === "negative phrase").map((r) => r.keyword);
  assert.ok(ebookNegs.includes("paperback") && !ebookNegs.includes("kindle"));
});

test("CSV: BOM, header, CRLF, quotes fields with commas or quotes", () => {
  const csv = adsKeywordsCsv([
    { keyword: 'say "hi", friend', matchType: "exact", adGroup: "G", bid: 0.3, source: "primary" },
  ]);
  assert.ok(csv.startsWith("\uFEFFKeyword,Match type,Ad group,Start bid ceiling (USD),Source\r\n"));
  assert.ok(csv.includes('"say ""hi"", friend",exact,G,0.30,primary\r\n'));
});

test("guide lists break-even lines and paste-ready keywords", () => {
  const guide = adsGuide({ title: "T", rows, royaltyUsd: 3.15, listPriceUsd: 9.99 });
  assert.ok(guide.includes("You earn about $3.15 per sale on Amazon.com at $9.99."));
  assert.ok(guide.includes("1 sale per 10 clicks (10%): up to $0.31 per click"));
  assert.ok(guide.includes("Exact + phrase:\nsudoku for adults\nlarge print sudoku"));
  assert.ok(adsGuide({ title: "T", rows, royaltyUsd: null, listPriceUsd: null }).includes("No royalty is set"));
});

test("Launch Kit includes ads_keywords.csv + ads_guide.txt using the book's real royalty", () => {
  const ctx: PublishContext = { title: "Sudoku Vol. 2", author: "Jane", bookType: "sudoku", trim: "8.5x11", pageCount: 64 };
  const md = buildMetadataJson({ title: ctx.title, author: "Jane", trimSize: "8.5x11", bookType: "sudoku", opportunityScore: null, pageCount: 64, description: "d", keywords: [], categories: [] });
  const data: PackageData = { metadataJson: md, keywords: { primary: ["sudoku for adults"], longTail: ["hard sudoku book"] }, description: "d", categories: [], alternativeTitles: [] };
  const files = packageFiles(ctx, data);
  const names = files.map((f) => f.name);
  assert.ok(names.includes("ads_keywords.csv") && names.includes("ads_guide.txt"));
  assert.ok(files.find((f) => f.name === "ads_keywords.csv")!.content.includes("sudoku for adults,exact,Exact - core keywords,0.31,primary"));
  // An override in the 50% band lowers the royalty, so the bid ceilings drop with it.
  const low = packageFiles(ctx, { ...data, metadataJson: { ...md, suggested_price: 8.99 } });
  assert.ok(low.find((f) => f.name === "ads_keywords.csv")!.content.includes("sudoku for adults,exact,Exact - core keywords,0.16,primary"));
  assert.ok(files.find((f) => f.name === "publish_checklist.txt")!.content.includes("ads_keywords.csv"));
});

console.log(`\n${passed} passed`);
