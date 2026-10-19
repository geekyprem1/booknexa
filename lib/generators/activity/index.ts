/**
 * Mixed Activity Book — a composer, not a new puzzle engine.
 *
 * Interleaves puzzle pages from the existing generators (word search, maze, sudoku,
 * connect-the-dots) into one variety book, then adds a combined solutions section.
 * Reuses each generator's low-level render bodies, so there is no new puzzle logic.
 */

import { escapeHtml } from "../../html/escape";
import { buildInteriorPdf, buildCoverPdf, type InteriorResult, type CoverResult } from "../../pdf";
import type { InteriorPageContent } from "../../pdf/templates/interior";
import type { TrimSize } from "../../pdf/kdp-specs";
import { hashSeed } from "../../util/prng";
import { padToKdpMinimum } from "../notes-pad";

import { resolveConfig, generatePuzzles, renderPuzzleBody, renderSolutionBody } from "../word-search";
import { generateMaze, renderMazePageBody, renderMazeSolutionBody } from "../maze";
import { generateSudoku, renderSudokuPuzzleBody, renderSudokuSolutionBody } from "../sudoku";
import { dotDotPuzzleBody, dotDotSolutionBody, DOTDOT_SHAPE_COUNT, type DotDotDifficulty } from "../dotdot";

const TRIM: TrimSize = "8.5x11";

export const ACTIVITY_SECTIONS = ["word_search", "maze", "sudoku", "dot_to_dot"] as const;
export type ActivitySection = (typeof ACTIVITY_SECTIONS)[number];

export function isActivitySection(v: unknown): v is ActivitySection {
  return typeof v === "string" && (ACTIVITY_SECTIONS as readonly string[]).includes(v);
}

export const MIN_ACTIVITY_PAGES = 24;

export interface ActivityOptions {
  theme: string; // used by the word-search section
  sections?: ActivitySection[];
  difficulty?: "easy" | "medium" | "hard";
  /** Total puzzle pages (a matching solutions section is added after). */
  pageCount?: number;
  seed?: number;
  title?: string;
  subtitle?: string;
  author?: string;
}

interface Item {
  puzzle: string; // page body HTML
  solution: string; // solution body HTML
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Build `n` items for one section using its generator's render bodies.
 * `displayIndexOf(local)` maps a section-local index to the book-global puzzle
 * number so interleaved sections don't all restart at "Puzzle 1".
 */
function buildSection(
  section: ActivitySection,
  n: number,
  ctx: { theme: string; difficulty: "easy" | "medium" | "hard"; seed: number },
  displayIndexOf: (localIndex: number) => number
): Item[] {
  const items: Item[] = [];
  if (section === "word_search") {
    // Pass the activity's seed: without it, resolveConfig hashes only
    // theme|difficulty|gridSize and every activity book (and the standalone
    // word-search book) gets a byte-identical word-search section.
    const cfg = resolveConfig({ theme: ctx.theme, puzzleCount: n, difficulty: ctx.difficulty, gridSize: 15, seed: ctx.seed });
    const puzzles = generatePuzzles(cfg);
    puzzles.forEach((p, i) => {
      const safe = { ...p, theme: escapeHtml(p.theme) };
      const d = displayIndexOf(i);
      items.push({ puzzle: renderPuzzleBody(safe, d), solution: renderSolutionBody(safe, d) });
    });
  } else if (section === "maze") {
    for (let i = 0; i < n; i++) {
      const m = generateMaze({ difficulty: ctx.difficulty, seed: ctx.seed + i * 101 });
      const d = displayIndexOf(i);
      items.push({ puzzle: renderMazePageBody(m, d), solution: renderMazeSolutionBody(m, d) });
    }
  } else if (section === "sudoku") {
    for (let i = 0; i < n; i++) {
      const p = generateSudoku({ difficulty: ctx.difficulty, seed: ctx.seed + i * 211 });
      const d = displayIndexOf(i);
      items.push({ puzzle: renderSudokuPuzzleBody(p, d), solution: renderSudokuSolutionBody(p, d) });
    }
  } else {
    // dot_to_dot
    const diff = ctx.difficulty as DotDotDifficulty;
    for (let i = 0; i < n; i++) {
      const shapeIdx = i % DOTDOT_SHAPE_COUNT;
      const d = displayIndexOf(i);
      items.push({ puzzle: dotDotPuzzleBody(shapeIdx, diff, d), solution: dotDotSolutionBody(shapeIdx, diff, d) });
    }
  }
  return items;
}

export interface ActivityBookResult {
  pageCount: number;
  sections: ActivitySection[];
  interior: InteriorResult;
  cover: CoverResult;
}

export async function buildActivityBook(opts: ActivityOptions): Promise<ActivityBookResult> {
  const theme = opts.theme.trim();
  const difficulty = opts.difficulty ?? "easy";
  const sections = (opts.sections && opts.sections.length ? opts.sections : [...ACTIVITY_SECTIONS]).filter(isActivitySection);
  const active = sections.length ? sections : [...ACTIVITY_SECTIONS];
  const pageCount = Math.max(MIN_ACTIVITY_PAGES, Math.min(80, Math.round(opts.pageCount ?? 40)));
  const seed = opts.seed ?? hashSeed(`activity|${theme}|${difficulty}|${pageCount}`);

  // Distribute puzzle pages across sections as evenly as possible. The
  // round-robin interleave below puts section `idx`'s `i`-th item at global
  // position i*len+idx, so number its pages that way up front: every puzzle
  // and solution in the book gets a unique, order-matching number.
  const per = Math.ceil(pageCount / active.length);
  const bySection = active.map((s, idx) =>
    buildSection(s, per, { theme, difficulty, seed: seed + idx * 1009 }, (i) => i * active.length + idx)
  );

  // Round-robin interleave puzzles (and keep solutions in the same order).
  const items: Item[] = [];
  for (let round = 0; round < per && items.length < pageCount; round++) {
    for (const list of bySection) {
      if (items.length >= pageCount) break;
      if (list[round]) items.push(list[round]);
    }
  }

  const title = opts.title?.trim() || `${cap(theme)} Activity Book`;
  const subtitle = opts.subtitle?.trim() || `Mazes, Word Search, Sudoku & More`;
  const author = opts.author?.trim() || "BookNexa";

  const pages: InteriorPageContent[] = [
    {
      showPageNumber: false,
      html: `<div style="display:flex;flex-direction:column;height:100%;justify-content:center;align-items:center;text-align:center">
        <div style="font-size:12pt;letter-spacing:0.25em;text-transform:uppercase;color:#999">Activity Book</div>
        <h1 style="font-size:38pt;margin:0.2in 0 0.1in;line-height:1.1">${escapeHtml(title)}</h1>
        <div style="width:2.4in;border-top:2px solid #222;margin:0.16in 0"></div>
        <h2 style="font-weight:normal;color:#444;margin:0;font-size:15pt">${escapeHtml(subtitle)}</h2>
        <div style="margin-top:0.7in;font-size:12pt;color:#333">${escapeHtml(author)}</div>
      </div>`,
    },
    ...items.map((it) => ({ showPageNumber: false, html: it.puzzle })),
    {
      showPageNumber: false,
      html: `<div style="display:flex;flex-direction:column;height:100%;justify-content:center;text-align:center"><h1>Solutions</h1><p class="muted">Answers for all ${items.length} puzzles</p></div>`,
    },
    ...items.map((it) => ({ showPageNumber: false, html: it.solution })),
  ];

  padToKdpMinimum(pages);
  const finalPageCount = pages.length;
  const interior = await buildInteriorPdf({ trim: TRIM, pageCount: finalPageCount, bleed: false }, pages);
  const cover = await buildCoverPdf({
    trim: TRIM, pageCount: finalPageCount, paper: "white",
    content: {
      title, subtitle, author,
      backText: `A ${theme} activity book packed with variety — mazes, word searches, sudoku and connect-the-dots — with full solutions. Hours of screen-free fun.`,
    },
  });

  return { pageCount: finalPageCount, sections: active, interior, cover };
}
