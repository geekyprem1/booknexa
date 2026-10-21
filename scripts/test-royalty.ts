/**
 * KDP royalty + printing cost suite.
 *
 *   npm run test:royalty
 *
 * Covers KDP's own worked example, the sales-page numbers, the 50/60 switch on
 * several marketplaces, the per-page band boundaries, JPY rounding, minimum
 * list price and the recommendation.
 */

import assert from "node:assert/strict";
import {
  formatMoney,
  isLargeTrim,
  minListPrice,
  printingCost,
  recommendAll,
  recommendPrice,
  royalty,
  royaltyRate,
} from "../lib/kdp/royalty";
import { TRIM_SIZES } from "../lib/pdf/kdp-specs";
import { buildMetadataJson, buildPricing, suggestedPrice } from "../lib/publishing/metadata";
import { buildPricingReport } from "../lib/publishing/package";

const LARGE = TRIM_SIZES["8.5x11"];
const REGULAR = TRIM_SIZES["6x9"];

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("── KDP royalty suite ───────────────────────────");

test("large vs regular trim (KDP: > 6.12in wide or > 9in tall)", () => {
  assert.equal(isLargeTrim(LARGE), true);
  assert.equal(isLargeTrim(REGULAR), false);
  assert.equal(isLargeTrim(TRIM_SIZES["7x10"]), true);
  assert.equal(isLargeTrim(TRIM_SIZES["5.5x8.5"]), false);
});

test("KDP worked example: 333pp regular US at $15 → $5.00 printing, $4.00 royalty", () => {
  assert.equal(printingCost("com", REGULAR, 333), 5.0);
  const r = royalty("com", REGULAR, 333, 15);
  assert.equal(r.rate, 0.6);
  assert.equal(r.royalty, 4.0);
  assert.equal(royalty("com", REGULAR, 333, 15, { expanded: true }).royalty, 1.0);
});

test("sales page numbers: 8.5x11, ≤110pp, amazon.com", () => {
  assert.equal(printingCost("com", LARGE, 100), 2.84);
  assert.equal(royalty("com", LARGE, 100, 9.99).royalty, 3.15);
  assert.equal(royalty("com", LARGE, 100, 8.99).royalty, 1.66);
  assert.equal(royalty("com", LARGE, 100, 7.99).royalty, 1.16);
  assert.equal(royalty("com", LARGE, 100, 11.99).royalty, 4.35);
});

test("50/60 switch at each marketplace threshold", () => {
  assert.equal(royaltyRate("com", 9.98), 0.5);
  assert.equal(royaltyRate("com", 9.99), 0.6);
  assert.equal(royaltyRate("uk", 7.98), 0.5);
  assert.equal(royaltyRate("uk", 7.99), 0.6);
  assert.equal(royaltyRate("ca", 13.99), 0.6);
  assert.equal(royaltyRate("jp", 999), 0.5);
  assert.equal(royaltyRate("jp", 1000), 0.6);
  assert.equal(royaltyRate("pl", 39), 0.5);
  assert.equal(royaltyRate("se", 110), 0.6);
});

test("fixed-only band ends at 110pp (108pp in AU)", () => {
  assert.equal(printingCost("com", LARGE, 110), 2.84);
  assert.equal(printingCost("com", LARGE, 112), 2.9); // 1.00 + 112 × 0.017 = 2.904
  assert.equal(printingCost("au", REGULAR, 108), 4.74);
  assert.equal(printingCost("au", REGULAR, 110), 4.84); // 2.42 + 110 × 0.022
});

test("JPY has no minor unit", () => {
  assert.equal(printingCost("jp", REGULAR, 200), 606); // 206 + 200 × 2
  assert.equal(royalty("jp", REGULAR, 200, 1000).royalty, -6);
  assert.equal(formatMoney("jp", 1000), "¥1000");
});

test("page count is clamped to 24–828", () => {
  assert.equal(printingCost("com", LARGE, 5), printingCost("com", LARGE, 24));
  assert.equal(printingCost("com", REGULAR, 5000), printingCost("com", REGULAR, 828));
});

test("minimum list price: cost / 50%, or the 60% band when that's too low", () => {
  assert.equal(minListPrice("com", LARGE, 100), 5.68); // 2.84 / 0.5
  // 600pp large: cost 1 + 600 × 0.017 = 11.20 → /0.5 = 22.40 (≥ 9.99) → /0.6 = 18.67
  assert.equal(printingCost("com", LARGE, 600), 11.2);
  assert.equal(minListPrice("com", LARGE, 600), 18.67);
  assert.equal(royalty("com", LARGE, 600, 18.66).belowMinimum, true);
  assert.equal(royalty("com", LARGE, 600, 18.67).belowMinimum, false);
});

test("recommendation = 60% threshold, or next .99 above the minimum", () => {
  const r = recommendPrice("com", LARGE, 100);
  assert.equal(r.listPrice, 9.99);
  assert.equal(r.royalty, 3.15);
  assert.equal(recommendPrice("uk", LARGE, 100).listPrice, 7.99);
  assert.equal(recommendPrice("com", LARGE, 600).listPrice, 18.99);
  // JP 300pp regular: cost 206 + 600 = 806; min 806 / 0.6 = 1344 → next multiple of 10.
  assert.equal(minListPrice("jp", REGULAR, 300), 1344);
  assert.equal(recommendPrice("jp", REGULAR, 300).listPrice, 1350);
});

test("recommendAll covers every marketplace with a positive royalty for a typical puzzle book", () => {
  const all = recommendAll(LARGE, 100);
  assert.equal(all.length, 8);
  for (const r of all) assert.ok(r.royalty > 0, `${r.marketplace} royalty ${r.royalty}`);
});

test("Launch Kit: suggested price is $9.99 for a typical 8.5x11 puzzle book (was $6.99–$8.99)", () => {
  assert.equal(suggestedPrice("sudoku", 64, "8.5x11"), 9.99);
  assert.equal(suggestedPrice("coloring", 50, "8.5x11"), 9.99);
  assert.equal(suggestedPrice("ebook", 120, "6x9"), 4.99);
  const md = buildMetadataJson({
    title: "T", author: "A", trimSize: "8.5x11", bookType: "word_search", opportunityScore: null,
    pageCount: 83, description: "d", keywords: [], categories: [],
  });
  assert.equal(md.suggested_price, 9.99);
  assert.equal(md.pricing?.marketplaces.length, 8);
  assert.equal(md.pricing?.marketplaces.find((r) => r.marketplace === "uk")?.list_price, 7.99);
  const ebook = buildMetadataJson({
    title: "T", author: "A", trimSize: "6x9", bookType: "ebook", opportunityScore: null,
    pageCount: 120, description: "d", keywords: [], categories: [],
  });
  assert.equal(ebook.pricing, undefined);
});

test("pricing.txt flags a 50%-band override and lists every store", () => {
  const report = buildPricingReport(buildPricing("8.5x11", 100), 8.99);
  assert.ok(report.includes("amazon.co.uk"));
  assert.ok(report.includes("$8.99: 50% royalty, ≈ $1.66 per sale (vs ≈ $3.15 at $9.99)"));
  assert.ok(!buildPricingReport(buildPricing("8.5x11", 100), 9.99).includes("Your Amazon.com price"));
});

console.log(`\n${passed} passed`);
