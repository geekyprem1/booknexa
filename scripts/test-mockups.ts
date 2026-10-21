/**
 * Mockup + A+ image render suite (Puppeteer, no DB or storage).
 *
 *   npm run test:mockups
 *
 * Builds a real sudoku book with a shelf color and a VOL badge, renders its
 * previews, then every mockup kind. Checks exact pixel sizes, the A+ 2 MB cap,
 * kind availability rules and bullet extraction. Writes the PNGs to
 * output/mockups-test/ for a visual check.
 */

import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { buildSudokuBook } from "../lib/generators/sudoku";
import { closeBrowser } from "../lib/pdf";
import { runWithCoverStyle } from "../lib/pdf/cover-style";
import { coverAssetFromSpec } from "../lib/mockups/assets";
import {
  APLUS_MAX_BYTES,
  isAplusKind,
  MOCKUP_KINDS,
  outputSize,
  previewPageIndexes,
  unavailableReason,
} from "../lib/mockups/kinds";
import { renderBookPreviews, renderMockup, toDataUri } from "../lib/mockups/render";
import { bulletsFor } from "../lib/mockups/source";
import type { MockupInputs } from "../lib/mockups/templates";

const OUT = "output/mockups-test";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log("── Mockups suite ───────────────────────────────");
  mkdirSync(OUT, { recursive: true });

  await test("A+ outputs meet KDP's recommended sizes", () => {
    assert.deepEqual(outputSize("aplus_banner_clean"), { width: 1940, height: 600 });
    assert.deepEqual(outputSize("aplus_square_1"), { width: 600, height: 600 });
    assert.deepEqual(outputSize("aplus_header"), { width: 1940, height: 1200 });
    assert.deepEqual(outputSize("paperback_3d"), { width: 1600, height: 1600 });
  });

  await test("availability rules and preview page picks", () => {
    assert.equal(unavailableReason("paperback_3d", { hasCover: true, previewCount: 0, seriesVolumes: 0 }), null);
    assert.ok(unavailableReason("look_inside", { hasCover: true, previewCount: 1, seriesVolumes: 0 }));
    assert.ok(unavailableReason("shelf_stack", { hasCover: true, previewCount: 3, seriesVolumes: 1 }));
    assert.equal(unavailableReason("aplus_square_3", { hasCover: true, previewCount: 3, seriesVolumes: 0 }), null);
    assert.deepEqual(previewPageIndexes(64), [3, 4, 62]);
    assert.deepEqual(previewPageIndexes(2), [0, 1]);
  });

  await test("bullets: description bullets first, then book facts", () => {
    const desc = "Intro line.\n- Thirty medium puzzles with unique solutions\n- Complete answer key at the back\n• Large 8.5 x 11 pages";
    assert.deepEqual(bulletsFor(desc, { bookType: "sudoku", pages: 64, puzzles: 30, trim: "8.5x11" }), [
      "Thirty medium puzzles with unique solutions",
      "Complete answer key at the back",
      "Large 8.5 x 11 pages",
    ]);
    assert.deepEqual(bulletsFor("", { bookType: "sudoku", pages: 64, puzzles: 30, trim: "8.5x11" }), [
      "30 puzzles inside",
      "64 pages",
      "8.5 × 11 inch paperback",
    ]);
  });

  const built = await runWithCoverStyle({ background: "#2f5d3a", spineColor: "#1e3d26", badge: "VOL. 2" }, () =>
    buildSudokuBook({ difficulty: "medium", puzzleCount: 30, seed: 42, title: "Sudoku Challenge: Brain-Boosting Puzzles, Vol. 2", subtitle: "30 Medium Puzzles with Solutions", author: "Jane Rivers" })
  );
  const previews = await renderBookPreviews(built);

  await test("previews: cover wrap + 3 interior pages", () => {
    assert.ok(previews);
    assert.equal(previews!.pages.length, 3);
    const cover = PNG.sync.read(Buffer.from(previews!.coverPng));
    assert.equal(cover.width, Math.round(built.cover.spec.fullWidthIn * 150));
    writeFileSync(`${OUT}/_cover-wrap.png`, previews!.coverPng);
    previews!.pages.forEach((p, i) => writeFileSync(`${OUT}/_page-${i + 1}.png`, p));
  });

  const c = coverAssetFromSpec("x", previews!.coverSpec);
  const src = toDataUri(previews!.coverPng);
  const base = { fullW: c.fullWidthIn, fullH: c.fullHeightIn, y: c.bleedIn, h: c.trimHeightIn };
  const front = { src, crop: { ...base, x: c.frontStartIn, w: c.panelWidthIn } };
  const inputs: MockupInputs = {
    front,
    spine: { src, crop: { ...base, x: c.spineStartIn, w: c.spineWidthIn } },
    spineRatio: c.spineWidthIn / c.trimHeightIn,
    aspect: 8.5 / 11,
    previews: previews!.pages.map((p) => toDataUri(p)),
    volumes: [front, front, front],
    title: "Sudoku Challenge: Brain-Boosting Puzzles, Vol. 2",
    subtitle: "30 Medium Puzzles with Unique Solutions & Complete Answer Key",
    author: "Jane Rivers",
    typeLabel: "Sudoku",
    bullets: ["30 medium puzzles with unique solutions", "Complete answer key at the back", "Big 8.5 × 11 inch pages"],
    accent: "#2f5d3a",
  };

  for (const kind of MOCKUP_KINDS) {
    await test(`${kind}: exact size${isAplusKind(kind) ? " (2× KDP recommended) + under 3 MB" : ""}`, async () => {
      const png = await renderMockup(kind, inputs);
      const img = PNG.sync.read(Buffer.from(png));
      assert.equal(img.width, outputSize(kind).width);
      assert.equal(img.height, outputSize(kind).height);
      if (isAplusKind(kind)) assert.ok(png.length < APLUS_MAX_BYTES, `${png.length} bytes`);
      writeFileSync(`${OUT}/${kind}.png`, png);
    });
  }

  await closeBrowser();
  console.log(`\n${passed} passed · images in ${OUT}/`);
}

main().catch(async (e) => {
  console.error(e);
  await closeBrowser();
  process.exit(1);
});
