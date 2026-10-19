/**
 * Generate production-quality sample word search books for Amazon KDP upload
 * testing. Writes interior + cover PDFs and preview PNGs into examples/<slug>/.
 *
 *   npm run examples:generate
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildInteriorPdf,
  buildCoverPdf,
  computeInterior,
  computeCover,
  renderPng,
  closeBrowser,
} from "../lib/pdf";
import { renderInteriorHtml } from "../lib/pdf/templates/interior";
import { renderCoverHtml } from "../lib/pdf/templates/cover";
import { PRODUCTION_DEFAULTS } from "../lib/config/defaults";
import {
  resolveConfig,
  generatePuzzles,
  buildInteriorPages,
} from "../lib/generators/word-search";
import type { Difficulty } from "../lib/generators/word-search";

const TRIM = PRODUCTION_DEFAULTS.trim; // 8.5x11
const PAPER = PRODUCTION_DEFAULTS.paper; // white
const BLEED = PRODUCTION_DEFAULTS.bleed; // false
const PUZZLES = 40; // → 83 pages (well over KDP's 24); thick enough for spine text
const DIFFICULTY: Difficulty = "medium";
const AUTHOR = "BookNexa";

interface BookSpec {
  slug: string;
  theme: string;
  title: string;
  subtitle: string;
  backText: string;
  /** Thematic cover colors. Layout/typography stay identical across books. */
  background: string;
  spineColor: string;
}

const BOOKS: BookSpec[] = [
  {
    slug: "dinosaur-word-search",
    theme: "Dinosaurs",
    title: "Dinosaur Word Search",
    subtitle: `${PUZZLES} Prehistoric Puzzles with Complete Answer Key`,
    backText: `Dig into ${PUZZLES} dinosaur-themed word search puzzles, from raptors to fossils. Every puzzle includes a full answer key. Perfect for kids, parents, and puzzle lovers of all ages.`,
    background: "#1d4d3b",
    spineColor: "#143a2c",
  },
  {
    slug: "halloween-word-search",
    theme: "Halloween",
    title: "Halloween Word Search",
    subtitle: `${PUZZLES} Spooky Puzzles with Complete Answer Key`,
    backText: `Get into the Halloween spirit with ${PUZZLES} spooky word search puzzles packed with ghosts, witches, and pumpkins. Complete answer key included. Great fun for the whole family.`,
    background: "#2a1a3e",
    spineColor: "#1d1030",
  },
  {
    slug: "christmas-word-search",
    theme: "Christmas",
    title: "Christmas Word Search",
    subtitle: `${PUZZLES} Festive Puzzles with Complete Answer Key`,
    backText: `Celebrate the season with ${PUZZLES} festive Christmas word search puzzles full of holiday cheer. Complete answer key included. A cozy gift for puzzle fans young and old.`,
    background: "#7a1f25",
    spineColor: "#5c171c",
  },
];

async function generateBook(book: BookSpec, examplesDir: string) {
  const cfg = resolveConfig({
    theme: book.theme,
    title: book.title,
    subtitle: book.subtitle,
    author: AUTHOR,
    puzzleCount: PUZZLES,
    difficulty: DIFFICULTY,
  });

  const puzzles = generatePuzzles(cfg);
  const pages = buildInteriorPages(cfg, puzzles);
  const pageCount = pages.length;

  const interiorSpec = computeInterior({ trim: TRIM, pageCount, bleed: BLEED });
  const coverSpec = computeCover({ trim: TRIM, pageCount, paper: PAPER });

  const dir = path.join(examplesDir, book.slug);
  const previewsDir = path.join(dir, "previews");
  await mkdir(previewsDir, { recursive: true });

  // ── PDFs ──
  const coverContent = {
    title: cfg.title,
    subtitle: cfg.subtitle,
    author: cfg.author,
    backText: book.backText,
    background: book.background,
    spineColor: book.spineColor,
  };

  const interior = await buildInteriorPdf({ trim: TRIM, pageCount, bleed: BLEED }, pages);
  const cover = await buildCoverPdf({ trim: TRIM, pageCount, paper: PAPER, content: coverContent });

  const interiorPath = path.join(dir, `${book.slug}-interior.pdf`);
  const coverPath = path.join(dir, `${book.slug}-cover.pdf`);
  await writeFile(interiorPath, interior.pdf);
  await writeFile(coverPath, cover.pdf);

  // ── preview screenshots ──
  const firstPuzzleIdx = 2;
  const firstSolutionIdx = 2 + cfg.puzzleCount + 1;

  const single = (idx: number, hideFolio: boolean) =>
    renderInteriorHtml(interiorSpec, [{ ...pages[idx], showPageNumber: hideFolio ? false : pages[idx].showPageNumber }]);

  const previews: Array<[string, Promise<Uint8Array>]> = [
    ["01-title.png", renderPng(single(0, true), { widthIn: interiorSpec.pageWidthIn, heightIn: interiorSpec.pageHeightIn })],
    ["02-puzzle.png", renderPng(single(firstPuzzleIdx, true), { widthIn: interiorSpec.pageWidthIn, heightIn: interiorSpec.pageHeightIn })],
    ["03-solution.png", renderPng(single(firstSolutionIdx, true), { widthIn: interiorSpec.pageWidthIn, heightIn: interiorSpec.pageHeightIn })],
    ["04-cover.png", renderPng(renderCoverHtml(coverSpec, coverContent), { widthIn: coverSpec.fullWidthIn, heightIn: coverSpec.fullHeightIn })],
  ];
  for (const [name, p] of previews) {
    await writeFile(path.join(previewsDir, name), await p);
  }

  const skipped = puzzles.reduce((n, p) => n + p.skipped.length, 0);
  console.log(`✓ ${book.slug}: ${pageCount} pages, spine ${coverSpec.spineWidthIn.toFixed(3)}in (text: ${coverSpec.allowsSpineText}), skipped ${skipped}`);

  return {
    slug: book.slug,
    theme: cfg.theme,
    title: cfg.title,
    subtitle: cfg.subtitle,
    author: cfg.author,
    trim: TRIM,
    paper: PAPER,
    bleed: BLEED,
    puzzleCount: cfg.puzzleCount,
    difficulty: cfg.difficulty,
    pageCount,
    spineWidthIn: Number(coverSpec.spineWidthIn.toFixed(4)),
    allowsSpineText: coverSpec.allowsSpineText,
    skippedPlacements: skipped,
    interior: path.relative(process.cwd(), interiorPath).replace(/\\/g, "/"),
    cover: path.relative(process.cwd(), coverPath).replace(/\\/g, "/"),
  };
}

async function main() {
  console.log("── Generating production sample books ──────────");
  const examplesDir = path.resolve(process.cwd(), "examples");
  await mkdir(examplesDir, { recursive: true });

  const manifest = [];
  for (const book of BOOKS) {
    manifest.push(await generateBook(book, examplesDir));
  }

  await writeFile(
    path.join(examplesDir, "manifest.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), books: manifest }, null, 2)
  );

  console.log("\n✓ Wrote examples/ + manifest.json");
  console.log("Next: npm run examples:validate");

  await closeBrowser();
}

main().catch((err) => {
  console.error("Example generation failed:", err);
  process.exitCode = 1;
});
