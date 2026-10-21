/**
 * Shared single-book generation pipeline.
 *
 * The one place that turns a typed request into a stored book (generate via the
 * EXISTING generators → upload PDFs → insert rows). Used by both `/api/books`
 * (Create wizard) and the Bundle Generator, so there's no duplicate generator
 * or orchestration code.
 */

import { getSupabaseAdminClient } from "../supabase/admin";
import { requireMutationRow } from "../supabase/errors";
import { putBookPdf, bookObjectKey } from "../storage";
import { buildWordSearchBook, resolveConfig, type Difficulty } from "../generators/word-search";
import { buildSudokuBook, MIN_SUDOKU_PUZZLES, SUDOKU_DIFFICULTIES, type SudokuDifficulty } from "../generators/sudoku";
import { buildMazeBook, MIN_MAZES, MAZE_DIFFICULTIES, type MazeDifficulty } from "../generators/maze";
import { buildColoringBook, MIN_COLORING_PAGES, COLORING_AGE_GROUPS, COLORING_STYLES, type ColoringAgeGroup, type ColoringStyle } from "../generators/coloring";
import { buildLowContentBook, LOW_CONTENT_PRODUCTS, isLowContentLayout, type LowContentLayout } from "../generators/lowcontent";
import { buildTracingBook, isTracingSet, type TracingSet } from "../generators/tracing";
import { buildMathBook, isMathOperation, MATH_DIFFICULTIES, type MathDifficulty, type MathOperation } from "../generators/math";
import { buildScrambleBook } from "../generators/scramble";
import { buildCryptogramBook } from "../generators/cryptogram";
import { buildDotDotBook, DOTDOT_DIFFICULTIES, type DotDotDifficulty } from "../generators/dotdot";
import { buildCrosswordBook } from "../generators/crossword";
import { buildActivityBook } from "../generators/activity";
import { generateWordList, generateMetadata } from "../ai";
import { loadPublishingProfile, profileAuthor } from "../publishing/profile";
import type { InteriorResult, CoverResult } from "../pdf";
import { runWithCoverStyle, type CoverStyle } from "../pdf/cover-style";
import { renderBookPreviews } from "../mockups/render";
import { savePreviews } from "../mockups/assets";

export type PipelineBookType =
  | "word_search" | "sudoku" | "maze" | "coloring"
  | "lowcontent" | "tracing" | "math"
  | "scramble" | "cryptogram" | "dot_to_dot" | "crossword" | "activity";
const WS_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function clampCount(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/**
 * Fresh random seed for each generated book. Generators hash only
 * type|theme|difficulty|count by default, so without a unique per-book seed
 * every user with the same config would get a byte-identical interior
 * (mass duplicate content on Amazon).
 */
const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

export interface BookGenInput {
  bookType: PipelineBookType;
  theme?: string; // required for word_search & coloring
  title?: string;
  difficulty?: string;
  count?: number; // puzzle/page count
  ageGroup?: string; // coloring
  style?: string; // coloring
  layout?: string; // lowcontent
  trim?: string; // lowcontent
  set?: string; // tracing
  operation?: string; // math
  largePrint?: boolean; // word_search / sudoku large-print edition
  author?: string; // from the Publishing Profile (passed to the generator's author option)
  /** Explicit PRNG seed. Omit for a fresh random seed (the normal case). */
  seed?: number;
  /** Shelf colors + series volume badge, merged into the generated cover. */
  coverStyle?: CoverStyle;
}

/** A valid stored seed: a non-negative 31-bit integer (fits mulberry32 + bigint). */
export function normalizeSeed(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n >= 2 ** 31) return undefined;
  return n;
}

interface BuildPlan {
  bookType: PipelineBookType;
  theme: string;
  title: string;
  difficulty: string;
  puzzleCount: number;
  wordSource: "ai" | "bank" | null;
  /** Stored on books.trim_size; defaults to 8.5x11 for the puzzle/text types. */
  trim?: string;
  config: Record<string, unknown>;
  metadata: { subtitle: string; description: string; keywords: string[]; generatedBy: string };
  build: (seed: number) => Promise<{ interior: InteriorResult; cover: CoverResult; pageCount: number }>;
}

/** Plan one book: validate inputs, generate metadata (+ word list), prepare a build closure. */
export async function planBook(input: BookGenInput): Promise<BuildPlan> {
  const userTitle = (input.title ?? "").trim();

  if (input.bookType === "coloring") {
    const theme = (input.theme ?? "").trim();
    if (!theme) throw new Error("Theme is required");
    const ageGroup: ColoringAgeGroup = COLORING_AGE_GROUPS.includes(input.ageGroup as ColoringAgeGroup) ? (input.ageGroup as ColoringAgeGroup) : "kids";
    const style: ColoringStyle = COLORING_STYLES.includes(input.style as ColoringStyle) ? (input.style as ColoringStyle) : "cute";
    const pageCount = clampCount(input.count, MIN_COLORING_PAGES, 40, 24);
    const metadata = await generateMetadata({ bookType: "coloring", theme, puzzleCount: pageCount, difficulty: ageGroup });
    const title = userTitle || metadata.title;
    return {
      bookType: "coloring", theme, title, difficulty: ageGroup, puzzleCount: pageCount, wordSource: null,
      config: { ageGroup, style }, metadata,
      build: (seed) => buildColoringBook({ theme, title, subtitle: metadata.subtitle, ageGroup, style, pageCount, backText: metadata.description, author: input.author, seed }),
    };
  }

  if (input.bookType === "lowcontent") {
    const layout: LowContentLayout = isLowContentLayout(input.layout) ? input.layout : "lined";
    const product = LOW_CONTENT_PRODUCTS[layout];
    const pageCount = clampCount(input.count, 24, 300, 120);
    const trim = input.trim || product.defaultTrim;
    const title = userTitle || product.label;
    const subtitle = `${pageCount} Pages · ${trim.replace("x", " × ")}`;
    // No AI: low-content metadata is templated from the product.
    const metadata = {
      subtitle,
      description: `${product.label} — ${product.blurb}. ${pageCount} pages, ${trim.replace("x", " × ")} inches. Perfect for daily use and gifting.`,
      keywords: [product.label.toLowerCase(), product.category.toLowerCase(), "low content book", "journal", "notebook"],
      generatedBy: "template",
    };
    return {
      bookType: "lowcontent", theme: product.label, title, difficulty: layout, puzzleCount: pageCount, wordSource: null, trim,
      config: { layout, trim, pageCount }, metadata,
      build: () => buildLowContentBook({ layout, pageCount, trim: trim as never, title, subtitle, author: input.author, backText: metadata.description }),
    };
  }

  if (input.bookType === "tracing") {
    const set: TracingSet = isTracingSet(input.set) ? input.set : "uppercase";
    const pageCount = clampCount(input.count, 24, 60, 30);
    const title = userTitle || "Tracing Practice Workbook";
    const metadata = {
      subtitle: "Handwriting Practice Workbook for Kids",
      description: `A fun handwriting practice workbook (${set}). Trace with clear guide lines, then practice writing. Perfect for preschool and kindergarten.`,
      keywords: ["tracing workbook", "handwriting practice", "kids workbook", "preschool", "kindergarten"],
      generatedBy: "algorithm",
    };
    return {
      bookType: "tracing", theme: "Tracing", title, difficulty: set, puzzleCount: pageCount, wordSource: null, trim: "8.5x11",
      config: { set, pageCount }, metadata,
      build: () => buildTracingBook({ set, pageCount, title, author: input.author }),
    };
  }

  if (input.bookType === "math") {
    const operation: MathOperation = isMathOperation(input.operation) ? input.operation : "addition";
    const difficulty: MathDifficulty = MATH_DIFFICULTIES.includes(input.difficulty as MathDifficulty) ? (input.difficulty as MathDifficulty) : "easy";
    const practicePages = clampCount(input.count, 20, 60, 30);
    const title = userTitle || "Math Practice Workbook";
    const metadata = {
      subtitle: `${operation[0].toUpperCase()}${operation.slice(1)} Drills`,
      description: `${operation} practice drills with a full answer key. ${practicePages} practice pages to build math fluency. Great for home and classroom.`,
      keywords: ["math workbook", `${operation} practice`, "kids math", "worksheets", "answer key"],
      generatedBy: "algorithm",
    };
    return {
      bookType: "math", theme: "Math", title, difficulty, puzzleCount: practicePages, wordSource: null, trim: "8.5x11",
      config: { operation, difficulty, practicePages }, metadata,
      build: (seed) => buildMathBook({ operation, difficulty, pageCount: practicePages, title, author: input.author, seed }),
    };
  }

  if (input.bookType === "scramble") {
    const theme = (input.theme ?? "").trim();
    if (!theme) throw new Error("Theme is required");
    const puzzleCount = clampCount(input.count, 11, 60, 22);
    const title = userTitle || `${cap(theme)} Word Scramble`;
    const metadata = {
      subtitle: `${puzzleCount} Themed Word Scramble Puzzles`,
      description: `${puzzleCount} fun ${theme} word scramble puzzles with a full answer key. Great for all ages.`,
      keywords: [`${theme} puzzles`, "word scramble", "word puzzles", "brain games", "activity book"],
      generatedBy: "algorithm",
    };
    return {
      bookType: "scramble", theme, title, difficulty: "standard", puzzleCount, wordSource: null, trim: "8.5x11",
      config: { puzzleCount }, metadata,
      build: (seed) => buildScrambleBook({ theme, puzzleCount, title, author: input.author, seed }),
    };
  }

  if (input.bookType === "cryptogram") {
    const puzzleCount = clampCount(input.count, 22, 60, 30);
    const title = userTitle || "Cryptogram Puzzles";
    const metadata = {
      subtitle: `${puzzleCount} Inspirational Quote Cryptograms`,
      description: `${puzzleCount} inspirational quote cryptograms with a starter hint and full answer key. Hours of brain-teasing fun.`,
      keywords: ["cryptogram puzzles", "cryptograms", "brain games", "quote puzzles", "adult puzzle book"],
      generatedBy: "algorithm",
    };
    return {
      bookType: "cryptogram", theme: "Cryptograms", title, difficulty: "standard", puzzleCount, wordSource: null, trim: "8.5x11",
      config: { puzzleCount }, metadata,
      build: (seed) => buildCryptogramBook({ puzzleCount, title, author: input.author, seed }),
    };
  }

  if (input.bookType === "dot_to_dot") {
    const difficulty: DotDotDifficulty = DOTDOT_DIFFICULTIES.includes(input.difficulty as DotDotDifficulty) ? (input.difficulty as DotDotDifficulty) : "easy";
    const pageCount = clampCount(input.count, 22, 60, 24);
    const title = userTitle || "Connect the Dots";
    const metadata = {
      subtitle: `${pageCount} Fun Dot-to-Dot Puzzles`,
      description: `${pageCount} fun connect-the-dots puzzles. Connect the numbered dots to reveal each picture. Great for kids and relaxing focus.`,
      keywords: ["connect the dots", "dot to dot", "kids activity book", "puzzles", "coloring companion"],
      generatedBy: "algorithm",
    };
    return {
      bookType: "dot_to_dot", theme: "Connect the Dots", title, difficulty, puzzleCount: pageCount, wordSource: null, trim: "8.5x11",
      config: { difficulty, pageCount }, metadata,
      build: (seed) => buildDotDotBook({ difficulty, pageCount, title, author: input.author, seed }),
    };
  }

  if (input.bookType === "crossword") {
    const theme = (input.theme ?? "").trim();
    if (!theme) throw new Error("Theme is required");
    const puzzleCount = clampCount(input.count, 11, 50, 20);
    const title = userTitle || `${cap(theme)} Crossword Puzzles`;
    const metadata = {
      subtitle: `${puzzleCount} Themed Crossword Puzzles`,
      description: `${puzzleCount} themed ${theme} crossword puzzles with clues and full solutions. Hours of engaging word fun.`,
      keywords: [`${theme} crossword`, "crossword puzzles", "word puzzles", "brain games", "puzzle book"],
      generatedBy: "algorithm",
    };
    return {
      bookType: "crossword", theme, title, difficulty: "standard", puzzleCount, wordSource: null, trim: "8.5x11",
      config: { puzzleCount }, metadata,
      build: (seed) => buildCrosswordBook({ theme, puzzleCount, title, author: input.author, seed }),
    };
  }

  if (input.bookType === "activity") {
    const theme = (input.theme ?? "").trim();
    if (!theme) throw new Error("Theme is required");
    const difficulty = WS_DIFFICULTIES.includes(input.difficulty as Difficulty) ? (input.difficulty as Difficulty) : "easy";
    const pageCount = clampCount(input.count, 24, 80, 40);
    const title = userTitle || `${cap(theme)} Activity Book`;
    const metadata = {
      subtitle: "Mazes, Word Search, Sudoku & More",
      description: `A ${theme} activity book packed with variety — mazes, word searches, sudoku and connect-the-dots — with full solutions. Hours of screen-free fun.`,
      keywords: [`${theme} activity book`, "activity book", "puzzle variety", "kids puzzles", "brain games"],
      generatedBy: "algorithm",
    };
    return {
      bookType: "activity", theme, title, difficulty, puzzleCount: pageCount, wordSource: null, trim: "8.5x11",
      config: { difficulty, pageCount }, metadata,
      build: (seed) => buildActivityBook({ theme, difficulty: difficulty as "easy" | "medium" | "hard", pageCount, title, author: input.author, seed }),
    };
  }

  if (input.bookType === "maze") {
    const difficulty: MazeDifficulty = MAZE_DIFFICULTIES.includes(input.difficulty as MazeDifficulty) ? (input.difficulty as MazeDifficulty) : "medium";
    const mazeCount = clampCount(input.count, MIN_MAZES, 100, 30);
    const metadata = await generateMetadata({ bookType: "maze", puzzleCount: mazeCount, difficulty });
    const title = userTitle || metadata.title;
    return {
      bookType: "maze", theme: input.theme?.trim() || "Maze", title, difficulty, puzzleCount: mazeCount, wordSource: null,
      config: {}, metadata,
      build: (seed) => buildMazeBook({ title, subtitle: metadata.subtitle, difficulty, mazeCount, backText: metadata.description, author: input.author, seed }),
    };
  }

  if (input.bookType === "sudoku") {
    const difficulty: SudokuDifficulty = SUDOKU_DIFFICULTIES.includes(input.difficulty as SudokuDifficulty) ? (input.difficulty as SudokuDifficulty) : "medium";
    const puzzleCount = clampCount(input.count, MIN_SUDOKU_PUZZLES, 100, 30);
    const largePrint = input.largePrint ?? false;
    const metadata = await generateMetadata({ bookType: "sudoku", puzzleCount, difficulty });
    const title = userTitle || (largePrint ? `${metadata.title} — Large Print` : metadata.title);
    return {
      bookType: "sudoku", theme: input.theme?.trim() || "Sudoku", title, difficulty, puzzleCount, wordSource: null,
      config: { largePrint }, metadata,
      build: (seed) => buildSudokuBook({ title, subtitle: metadata.subtitle, difficulty, puzzleCount, backText: metadata.description, author: input.author, largePrint, seed }),
    };
  }

  // word_search
  const theme = (input.theme ?? "").trim();
  if (!theme) throw new Error("Theme is required");
  const difficulty: Difficulty = WS_DIFFICULTIES.includes(input.difficulty as Difficulty) ? (input.difficulty as Difficulty) : "medium";
  const puzzleCount = clampCount(input.count, 11, 50, 25);
  const largePrint = input.largePrint ?? false;
  let words: string[] | undefined;
  let wordSource: "ai" | "bank" = "bank";
  try {
    words = (await generateWordList({ niche: theme, count: 30 })).words;
    wordSource = "ai";
  } catch {
    wordSource = "bank";
  }
  const metadata = await generateMetadata({ bookType: "word_search", theme, puzzleCount, difficulty });
  const title = userTitle || (largePrint ? `${metadata.title} — Large Print` : metadata.title);
  const cfg = resolveConfig({ theme, title, subtitle: metadata.subtitle, puzzleCount, difficulty, largePrint });
  return {
    bookType: "word_search", theme, title, difficulty, puzzleCount, wordSource,
    config: { gridSize: cfg.gridSize, wordsPerPuzzle: cfg.wordsPerPuzzle, largePrint }, metadata,
    build: (seed) => buildWordSearchBook({ theme, title, subtitle: metadata.subtitle, puzzleCount, difficulty, words, backText: metadata.description, author: input.author, largePrint, seed }),
  };
}

export interface StoredBook {
  id: string;
  title: string;
  bookType: PipelineBookType;
  pageCount: number;
  wordSource: "ai" | "bank" | null;
  metadataBy: string;
}

/** Plan → insert → build → upload → finalize. Marks the book failed and rethrows on error. */
export async function generateAndStoreBook(
  userId: string,
  input: BookGenInput,
  opts?: {
    opportunity?: unknown;
    bundleId?: string | null;
    /** Shelf / series grouping (Shelf Suite). Only written when set, so callers that
     *  don't use shelves keep working before the shelves migration is applied. */
    shelfId?: string | null;
    seriesId?: string | null;
    volumeNo?: number | null;
    onProgress?: (step: string, percent: number) => void | Promise<void>;
  }
): Promise<StoredBook> {
  const admin = getSupabaseAdminClient();
  const progress = async (step: string, pct: number) => {
    try { await opts?.onProgress?.(step, pct); } catch { /* progress is best-effort */ }
  };
  // Inherit the author from the Publishing Profile (passed to the generator's
  // existing author option — no generator changes).
  const author = input.author ?? profileAuthor(await loadPublishingProfile(userId));
  await progress("Metadata", 15);
  const plan = await planBook({ ...input, author });
  const seed = normalizeSeed(input.seed) ?? randomSeed();
  const grouping: Record<string, unknown> = {};
  if (opts?.shelfId) grouping.shelf_id = opts.shelfId;
  if (opts?.seriesId) grouping.series_id = opts.seriesId;
  if (opts?.volumeNo) grouping.volume_no = opts.volumeNo;

  const insertResult = await admin
    .from("books")
    .insert({
      user_id: userId,
      book_type: plan.bookType,
      theme: plan.theme,
      title: plan.title,
      status: "generating",
      difficulty: plan.difficulty,
      puzzle_count: plan.puzzleCount,
      trim_size: plan.trim ?? "8.5x11",
      word_source: plan.wordSource,
      config: { ...plan.config, author },
      opportunity: opts?.opportunity ?? null,
      bundle_id: opts?.bundleId ?? null,
      seed,
      ...grouping,
    })
    .select("id")
    .single();
  const inserted = requireMutationRow(insertResult, "Create book");
  const bookId = inserted.id as string;

  try {
    await progress("Generating", 40);
    const book = await runWithCoverStyle(input.coverStyle, () => plan.build(seed));
    await progress("Uploading", 80);
    const interiorKey = bookObjectKey(userId, bookId, "interior");
    const coverKey = bookObjectKey(userId, bookId, "cover");
    await putBookPdf(interiorKey, book.interior.pdf);
    await putBookPdf(coverKey, book.cover.pdf);
    await progress("Finalizing", 95);

    const metadataResult = await admin.from("book_metadata").upsert({
      book_id: bookId, title: plan.title, subtitle: plan.metadata.subtitle,
      description: plan.metadata.description, keywords: plan.metadata.keywords, generated_by: plan.metadata.generatedBy,
    }).select("book_id").single();
    requireMutationRow(metadataResult, "Save book metadata");

    // Scramble/crossword resolve AI vs bank inside the generator; prefer that over the plan default.
    const wordSource =
      "wordSource" in book && (book.wordSource === "ai" || book.wordSource === "bank")
        ? book.wordSource
        : plan.wordSource;

    const completeResult = await admin.from("books").update({
      status: "completed", page_count: book.pageCount,
      interior_key: interiorKey, cover_key: coverKey, word_source: wordSource,
      updated_at: new Date().toISOString(),
    }).eq("id", bookId).select("id").maybeSingle();
    requireMutationRow(completeResult, "Complete book", "Book");

    // Best-effort PNG previews (cover wrap + 3 interior pages) for mockups and the
    // A+ images. A failure here never fails the book.
    try {
      await progress("Previews", 97);
      const previews = await renderBookPreviews(book);
      if (previews) await savePreviews(userId, bookId, previews);
    } catch (previewError) {
      console.warn("[books] preview render skipped:", previewError instanceof Error ? previewError.message : previewError);
    }

    return { id: bookId, title: plan.title, bookType: plan.bookType, pageCount: book.pageCount, wordSource, metadataBy: plan.metadata.generatedBy };
  } catch (err) {
    const failedResult = await admin.from("books")
      .update({ status: "failed", error: err instanceof Error ? err.message : "Generation failed" })
      .eq("id", bookId)
      .select("id")
      .maybeSingle();
    try {
      requireMutationRow(failedResult, "Mark book failed", "Book");
    } catch (statusError) {
      console.error("[books] could not persist failed status:", statusError);
    }
    throw err;
  }
}
