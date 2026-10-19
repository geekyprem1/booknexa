/**
 * Sudoku book assembly. Config → deterministic puzzles → interior pages
 * (title → instructions → puzzles → solutions → end page) → interior + cover
 * PDFs via the existing KDP PDF engine.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import { PRODUCTION_DEFAULTS } from "../../config/defaults";
import { hashSeed } from "../../util/prng";
import { generateSudoku } from "./generate";
import { renderSudokuPuzzleBody, renderSudokuSolutionBody } from "./render";
import type { SudokuDifficulty, SudokuPuzzle } from "./types";

/** Min puzzles so the book clears KDP's 24-page minimum (pages = 2N + 4). */
export const MIN_SUDOKU_PUZZLES = 10;

export interface SudokuBookOptions {
  difficulty?: SudokuDifficulty;
  puzzleCount?: number;
  seed?: number;
  title?: string;
  subtitle?: string;
  author?: string;
  backText?: string;
  /** Large-print edition: bigger cells and numbers (seniors market). */
  largePrint?: boolean;
}

export interface ResolvedSudokuConfig {
  difficulty: SudokuDifficulty;
  puzzleCount: number;
  seed: number;
  title: string;
  subtitle: string;
  author: string;
  largePrint: boolean;
}

const DEFAULTS = {
  difficulty: "medium" as SudokuDifficulty,
  puzzleCount: 30,
  author: "BookNexa",
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function resolveSudokuConfig(opts: SudokuBookOptions): ResolvedSudokuConfig {
  const difficulty = opts.difficulty ?? DEFAULTS.difficulty;
  const puzzleCount = Math.max(MIN_SUDOKU_PUZZLES, opts.puzzleCount ?? DEFAULTS.puzzleCount);
  const seed = opts.seed ?? hashSeed(`sudoku|${difficulty}|${puzzleCount}`);
  const largePrint = opts.largePrint ?? false;
  return {
    difficulty,
    puzzleCount,
    seed,
    title: opts.title ?? `Sudoku Puzzle Book${largePrint ? " — Large Print" : ""}`,
    subtitle: opts.subtitle ?? `${puzzleCount} ${largePrint ? "Large-Print " : ""}${cap(difficulty)} Puzzles with Solutions`,
    author: opts.author ?? DEFAULTS.author,
    largePrint,
  };
}

/** Deterministic puzzle set: seed + index → distinct, unique puzzles. */
export function generateSudokuPuzzles(cfg: ResolvedSudokuConfig): SudokuPuzzle[] {
  return Array.from({ length: cfg.puzzleCount }, (_, i) =>
    generateSudoku({ difficulty: cfg.difficulty, seed: cfg.seed + i })
  );
}

export function buildSudokuInteriorPages(
  cfg: ResolvedSudokuConfig,
  puzzles: SudokuPuzzle[]
): InteriorPageContent[] {
  cfg = {
    ...cfg,
    title: escapeHtml(cfg.title),
    subtitle: escapeHtml(cfg.subtitle),
    author: escapeHtml(cfg.author),
  };
  const pages: InteriorPageContent[] = [];

  // Title page
  pages.push({
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
        <div style="font-size:12pt;letter-spacing:0.25em;text-transform:uppercase;color:#999">Sudoku</div>
        <h1 style="font-size:40pt;margin:0.2in 0 0.1in;line-height:1.1">${cfg.title}</h1>
        <div style="width:2.4in;border-top:2px solid #222;margin:0.18in 0"></div>
        <h2 style="font-weight:normal;color:#444;margin:0;font-size:15pt">${cfg.subtitle}</h2>
        <div style="margin-top:0.7in;font-size:13pt;color:#222">${cfg.author}</div>
      </div>`,
  });

  // Instructions page
  pages.push({
    showPageNumber: false,
    html: `
      <h2>How to play</h2>
      <p>Fill in the grid so that every row, every column, and every 3&times;3 box
      contains the digits 1 through 9 exactly once.</p>
      <p>Each puzzle has one unique solution and can be solved by logic alone — no
      guessing required. The complete answer key is at the back of the book.</p>
      <p class="muted">Difficulty: ${cap(cfg.difficulty)}</p>`,
  });

  // Puzzle pages
  puzzles.forEach((p, i) => pages.push({ html: renderSudokuPuzzleBody(p, i, cfg.largePrint) }));

  // Solutions divider
  pages.push({
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;text-align:center">
        <h1>Solutions</h1>
        <p class="muted">Answer key for all ${puzzles.length} puzzles</p>
      </div>`,
  });

  // Solution pages
  puzzles.forEach((p, i) => pages.push({ html: renderSudokuSolutionBody(p, i, cfg.largePrint) }));

  // End page
  pages.push({
    showPageNumber: false,
    html: `
      <div style="display:flex;flex-direction:column;height:100%;justify-content:center;text-align:center">
        <h2 style="margin:0 0 0.1in">Thanks for playing!</h2>
        <p class="muted">We hope you enjoyed these ${puzzles.length} ${cfg.difficulty} sudoku puzzles.</p>
      </div>`,
  });

  return pages;
}

export interface SudokuBookResult {
  config: ResolvedSudokuConfig;
  puzzles: SudokuPuzzle[];
  pageCount: number;
  interior: InteriorResult;
  cover: CoverResult;
}

export async function buildSudokuBook(opts: SudokuBookOptions): Promise<SudokuBookResult> {
  const config = resolveSudokuConfig(opts);
  const puzzles = generateSudokuPuzzles(config);
  const pages = buildSudokuInteriorPages(config, puzzles);
  const pageCount = pages.length;

  const trim = PRODUCTION_DEFAULTS.trim;
  const bleed = PRODUCTION_DEFAULTS.bleed;

  const interior = await buildInteriorPdf({ trim, pageCount, bleed }, pages);

  const cover = await buildCoverPdf({
    trim,
    pageCount,
    paper: PRODUCTION_DEFAULTS.paper,
    content: {
      title: config.title,
      subtitle: config.subtitle,
      author: config.author,
      backText:
        opts.backText ??
        `${config.puzzleCount} ${config.difficulty} sudoku puzzles with a complete answer key. One unique solution per puzzle — solvable by logic alone. Great for sharpening focus and relaxing.`,
    },
  });

  return { config, puzzles, pageCount, interior, cover };
}
