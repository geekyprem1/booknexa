/**
 * Shelf Suite validation suite (pure parts — no DB, no browser).
 *
 *   npm run test:shelves
 *
 * Covers: title patterns, volume subthemes, base-input extraction, cover-style
 * normalization + async isolation, the cover badge, and that a series' stored
 * request still passes the shared book-request parser.
 */

import assert from "node:assert/strict";
import {
  baseInputFromBook,
  baseInputFromJob,
  isValidTitlePattern,
  normalizeCoverStyle,
  normalizeSubthemes,
  optionalText,
  renderTitle,
  seriesNameFromTitle,
  volumeBadge,
  volumeTheme,
} from "../lib/shelves/core";
import { applyCoverStyle, currentCoverStyle, runWithCoverStyle } from "../lib/pdf/cover-style";
import { renderCoverHtml } from "../lib/pdf/templates/cover";
import { computeCover } from "../lib/pdf/kdp-specs";
import { parseBookRequest } from "../lib/books/request";
import { normalizePenName } from "../lib/publishing/pen-name";
import { DEFAULT_PROFILE, profileAuthor, resolvedAuthor } from "../lib/publishing/profile";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("── Shelf Suite suite ───────────────────────────");

  await test("renderTitle fills {name} and {n}, drops unknown placeholders", () => {
    assert.equal(renderTitle("{name}, Vol. {n}", { name: "Garden Word Search", n: 3 }), "Garden Word Search, Vol. 3");
    assert.equal(renderTitle("Vol {n}: {name} {oops}", { name: "Sudoku", n: 12 }), "Vol 12: Sudoku");
  });

  await test("title pattern must contain {n}", () => {
    assert.equal(isValidTitlePattern("{name}, Vol. {n}"), true);
    assert.equal(isValidTitlePattern("{name}"), false);
    assert.equal(isValidTitlePattern("{n}"), true);
    assert.equal(isValidTitlePattern(""), false);
    assert.equal(isValidTitlePattern(42), false);
  });

  await test("volumeTheme cycles subthemes; no subthemes keeps the base", () => {
    const subs = ["Herbs", "Roses", "Vegetables"];
    assert.equal(volumeTheme("Gardening", subs, 1), "Gardening: Herbs");
    assert.equal(volumeTheme("Gardening", subs, 3), "Gardening: Vegetables");
    assert.equal(volumeTheme("Gardening", subs, 4), "Gardening: Herbs");
    assert.equal(volumeTheme("Gardening", [], 4), "Gardening");
    assert.equal(volumeTheme(undefined, subs, 2), undefined);
  });

  await test("baseInputFromJob strips bookkeeping and per-book fields", () => {
    const base = baseInputFromJob({
      theme: "Dogs", count: 25, largePrint: true, difficulty: "easy",
      title: "Dog Word Search", opportunity: { x: 1 }, author: "Pen", seed: 9,
      coverStyle: { badge: "VOL. 1" }, shelfId: "s", seriesId: "x", volumeNo: 1,
      _cost: 2, _action: "word_search", style: null,
    });
    assert.deepEqual(base, { theme: "Dogs", count: 25, largePrint: true, difficulty: "easy" });
    assert.deepEqual(baseInputFromJob(null), {});
  });

  await test("baseInputFromBook rebuilds a lowcontent request from columns + config", () => {
    const base = baseInputFromBook({
      book_type: "lowcontent", theme: "Lined Journal", difficulty: "lined", puzzle_count: 120,
      trim_size: "6x9", config: { layout: "lined", trim: "6x9", pageCount: 120 },
    });
    assert.equal(base.layout, "lined");
    assert.equal(base.trim, "6x9");
    assert.equal(base.count, 120);
    const parsed = parseBookRequest({ ...base, bookType: "lowcontent" });
    assert.equal(parsed.ok, true);
  });

  await test("stored base input re-parses with the same count (puzzle + page types)", () => {
    const ws = parseBookRequest({ bookType: "word_search", ...baseInputFromJob({ theme: "Cats", count: 50, largePrint: true }) });
    assert.ok(ws.ok && ws.count === 50 && ws.input.largePrint === true);
    const math = parseBookRequest({ bookType: "math", ...baseInputFromJob({ count: 40, operation: "addition", difficulty: "easy" }) });
    assert.ok(math.ok && math.count === 40 && math.input.operation === "addition");
  });

  await test("normalizeCoverStyle keeps only #rrggbb", () => {
    assert.deepEqual(normalizeCoverStyle({ background: "#AABBCC", spineColor: "red" }), { background: "#aabbcc" });
    assert.deepEqual(normalizeCoverStyle({ background: "#fff;}body{display:none" }), {});
    assert.deepEqual(normalizeCoverStyle("nope"), {});
  });

  await test("normalizeSubthemes trims, de-dupes and caps", () => {
    assert.deepEqual(normalizeSubthemes([" Herbs ", "herbs", "", 3, "Roses"]), ["Herbs", "Roses"]);
    assert.equal(normalizeSubthemes(Array.from({ length: 50 }, (_, i) => `t${i}`)).length, 30);
    assert.deepEqual(normalizeSubthemes("x"), []);
  });

  await test("optionalText: undefined = untouched, blank/null = clear", () => {
    assert.equal(optionalText(undefined, 10), undefined);
    assert.equal(optionalText(null, 10), null);
    assert.equal(optionalText("   ", 10), null);
    assert.equal(optionalText("  a  b ", 10), "a b");
    assert.equal(optionalText("abcdefghijkl", 5), "abcde");
  });

  await test("seriesNameFromTitle drops a trailing volume number", () => {
    assert.equal(seriesNameFromTitle("Garden Word Search, Vol. 2"), "Garden Word Search");
    assert.equal(seriesNameFromTitle("Sudoku Volume 10"), "Sudoku");
    assert.equal(seriesNameFromTitle("Mazes #3"), "Mazes");
    assert.equal(seriesNameFromTitle("Dinosaur Word Search"), "Dinosaur Word Search");
    assert.equal(volumeBadge(4), "VOL. 4");
  });

  await test("cover style is scoped per async build and never overrides generator colors", async () => {
    const base = { title: "T", subtitle: "S", author: "A", backText: "B" };
    assert.equal(currentCoverStyle(), undefined);
    const [a, b] = await Promise.all([
      runWithCoverStyle({ background: "#111111", badge: "VOL. 1" }, async () => {
        await new Promise((r) => setTimeout(r, 15));
        return applyCoverStyle(base);
      }),
      runWithCoverStyle({ background: "#222222", badge: "VOL. 2" }, async () => applyCoverStyle(base)),
    ]);
    assert.equal(a.background, "#111111");
    assert.equal(a.badge, "VOL. 1");
    assert.equal(b.background, "#222222");
    assert.equal(b.badge, "VOL. 2");
    const own = await runWithCoverStyle({ background: "#111111" }, async () => applyCoverStyle({ ...base, background: "#abcdef" }));
    assert.equal(own.background, "#abcdef");
    assert.equal(applyCoverStyle(base).badge, undefined);
  });

  await test("cover badge renders escaped and only when set", () => {
    const spec = computeCover({ trim: "8.5x11", pageCount: 100 });
    const content = { title: "T", subtitle: "S", author: "A", backText: "B" };
    assert.ok(!renderCoverHtml(spec, content).includes('class="badge"'));
    const html = renderCoverHtml(spec, { ...content, badge: "VOL. <3>" });
    assert.ok(html.includes('<div class="badge"><span>VOL. &lt;3&gt;</span></div>'));
  });

  await test("pen name: normalize + resolve (never the BookNexa fallback)", () => {
    assert.equal(normalizePenName("  Jane   Rivers "), "Jane Rivers");
    assert.equal(normalizePenName("J"), null);
    assert.equal(normalizePenName("x".repeat(121)), null);
    assert.equal(normalizePenName(5), null);
    const p = { ...DEFAULT_PROFILE };
    assert.equal(resolvedAuthor(p), null);
    assert.equal(profileAuthor(p), "BookNexa");
    assert.equal(resolvedAuthor({ ...p, authorName: "Real Name" }), "Real Name");
    assert.equal(resolvedAuthor({ ...p, authorName: "Real Name", penName: " Pen " }), "Pen");
  });

  console.log(`\n${passed} passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
