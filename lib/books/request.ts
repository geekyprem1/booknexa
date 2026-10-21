/**
 * Shared validation for a "generate a print book" request.
 *
 * Used by POST /api/books and by the Shelf Suite's series-volume route, so both
 * entry points clamp counts, require themes and pick trims the same way. Pure:
 * no auth, billing or I/O — callers handle those.
 */

import type { PipelineBookType } from "./pipeline";
import { GenerationInputError, normalizePuzzleCount } from "../generation-input";
import { isLowContentLayout } from "../generators/lowcontent";
import { TRIM_SIZES } from "../pdf/kdp-specs";

export const BOOK_TYPES: PipelineBookType[] = [
  "word_search", "sudoku", "maze", "coloring",
  "lowcontent", "tracing", "math",
  "scramble", "cryptogram", "dot_to_dot", "crossword", "activity",
];

export const BOOK_TYPE_LABEL: Record<PipelineBookType, string> = {
  word_search: "Word Search",
  sudoku: "Sudoku Puzzle Book",
  maze: "Maze Puzzle Book",
  coloring: "Coloring Book",
  lowcontent: "Journal / Planner",
  tracing: "Tracing Workbook",
  math: "Math Workbook",
  scramble: "Word Scramble",
  cryptogram: "Cryptogram Puzzles",
  dot_to_dot: "Connect the Dots",
  crossword: "Crossword Puzzles",
  activity: "Activity Book",
};

// Types whose "count" means PAGES/PUZZLES validated inside the generator; the route
// just clamps to a safe wide range instead of the puzzle-count config.
export const PAGE_COUNT_TYPES: PipelineBookType[] = [
  "lowcontent", "tracing", "math", "scramble", "cryptogram", "dot_to_dot", "crossword", "activity",
];

// Themed types that require a theme/topic (like word search).
export const THEME_TYPES: PipelineBookType[] = ["word_search", "coloring", "scramble", "crossword", "activity"];

/** The job input stored on generation_jobs.input (before _cost/_action are added). */
export interface BookJobInput {
  theme?: string;
  title?: string;
  difficulty?: string;
  count: number;
  ageGroup?: string;
  style?: string;
  layout?: string;
  trim?: string;
  set?: string;
  operation?: string;
  largePrint: boolean;
  opportunity?: object;
}

export type ParsedBookRequest =
  | { ok: true; bookType: PipelineBookType; input: BookJobInput; displayTitle: string; count: number }
  | { ok: false; status: 400; error: string };

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export function parseBookRequest(body: Record<string, unknown>): ParsedBookRequest {
  if (body.bookType === "ebook") return { ok: false, status: 400, error: "Use /api/ebook for ebooks." };

  const bookType: PipelineBookType = BOOK_TYPES.includes(body.bookType as PipelineBookType)
    ? (body.bookType as PipelineBookType)
    : "word_search";

  // Page-based types (lowcontent/tracing/math) count PAGES, not puzzles; the
  // generator clamps to its own range, so only a wide safe clamp is needed here.
  let layout: string | undefined;
  let trim: string | undefined;
  let count: number;
  if (PAGE_COUNT_TYPES.includes(bookType)) {
    if (bookType === "lowcontent") {
      if (!isLowContentLayout(body.layout)) return { ok: false, status: 400, error: "A valid layout is required" };
      layout = body.layout;
      trim = typeof body.trim === "string" && body.trim in TRIM_SIZES ? body.trim : undefined;
    }
    const rawPages = Number(body.pageCount ?? body.puzzleCount ?? body.count);
    count = Number.isFinite(rawPages) ? Math.min(300, Math.max(20, Math.round(rawPages))) : 30;
  } else {
    try {
      count = normalizePuzzleCount(bookType, body.puzzleCount ?? body.count);
    } catch (error) {
      if (error instanceof GenerationInputError) return { ok: false, status: 400, error: error.message };
      throw error;
    }
  }

  const theme = typeof body.theme === "string" ? body.theme.trim() : "";
  if (THEME_TYPES.includes(bookType) && !theme) return { ok: false, status: 400, error: "Theme is required" };

  const userTitle = typeof body.title === "string" ? body.title.trim() : "";
  const displayTitle = userTitle || (theme ? theme : BOOK_TYPE_LABEL[bookType]);

  const input: BookJobInput = {
    theme: theme || undefined,
    title: userTitle || undefined,
    difficulty: str(body.difficulty),
    count,
    ageGroup: str(body.ageGroup),
    style: str(body.style),
    layout,
    trim,
    set: str(body.set),
    operation: str(body.operation),
    largePrint: body.largePrint === true,
    opportunity: body.opportunity && typeof body.opportunity === "object" ? (body.opportunity as object) : undefined,
  };

  return { ok: true, bookType, input, displayTitle, count };
}
