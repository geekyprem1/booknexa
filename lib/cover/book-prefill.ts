/**
 * Cover Studio "pick a book" prefill: turn a books row into the Studio form
 * fields, so the user doesn't retype title, author, niche and trim.
 */

import { TRIM_SIZES } from "../pdf/kdp-specs";
import type { CoverGenre } from "./types";
import { cleanBlurb } from "./blurb";

export interface CoverBookOption {
  id: string;
  title: string;
  subtitle: string;
  /** Book description, used as the back-cover blurb. */
  description: string;
  niche: string;
  author: string;
  genre: CoverGenre;
  trim: string;
  pageCount: number | null;
  isEbook: boolean;
  typeLabel: string;
}

const PUZZLE = new Set(["word_search", "sudoku", "maze", "crossword", "cryptogram", "scramble"]);
const KIDS = new Set(["tracing", "math", "dot_to_dot", "activity", "storybook", "story"]);

/** Best-guess Studio genre for a book type. Ebooks are non-fiction how-to guides. */
export function genreForBookType(bookType: string): CoverGenre {
  if (bookType === "coloring") return "coloring";
  if (PUZZLE.has(bookType)) return "puzzle";
  if (KIDS.has(bookType)) return "kids";
  return "self_help";
}

type Meta = { subtitle: string | null; description?: string | null };

export function coverBookOption(
  book: {
    id: string;
    title: string;
    book_type: string;
    theme: string | null;
    trim_size: string | null;
    page_count: number | null;
    config: Record<string, unknown> | null;
    book_metadata: Meta[] | Meta | null;
  },
  fallbackAuthor: string,
  typeLabel: string
): CoverBookOption {
  const meta = Array.isArray(book.book_metadata) ? book.book_metadata[0] : book.book_metadata;
  const isEbook = book.book_type === "ebook";
  const trimRaw = book.trim_size ?? (isEbook ? "6x9" : "8.5x11");
  const author = typeof book.config?.author === "string" && book.config.author.trim() ? book.config.author.trim() : fallbackAuthor;
  return {
    id: book.id,
    title: book.title,
    subtitle: meta?.subtitle ?? "",
    description: cleanBlurb(meta?.description),
    niche: book.theme ?? "",
    author,
    genre: genreForBookType(book.book_type),
    trim: trimRaw in TRIM_SIZES ? trimRaw : isEbook ? "6x9" : "8.5x11",
    pageCount: book.page_count,
    isEbook,
    typeLabel,
  };
}
