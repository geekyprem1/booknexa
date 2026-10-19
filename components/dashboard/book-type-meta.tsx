/**
 * Shared visual metadata for each book type — icon + category tint. Used by the
 * Create wizard type picker and the Publishing Vault so both stay consistent.
 */

import {
  Grid3x3, Hash, Waypoints, Grid2x2, Shuffle, KeyRound, Spline,
  Palette, Layers, PenLine, Calculator, Sparkles, NotebookPen, BookOpen,
  type LucideIcon,
} from "lucide-react";
import type { BookType } from "@/lib/opportunity";

// Category accent colors (subtle tints in the UI) — drawn from the logo spectrum.
const PUZZLE = "#1463FF"; // logo blue
const KIDS = "#7B2CF5"; // logo violet
const TEXT = "#0092D6"; // logo cyan (darkened for ≥3:1 icon contrast on its tint)

export interface BookTypeMeta {
  icon: LucideIcon;
  tint: string;
}

export const BOOK_TYPE_META: Record<BookType, BookTypeMeta> = {
  word_search: { icon: Grid3x3, tint: PUZZLE },
  sudoku: { icon: Hash, tint: PUZZLE },
  maze: { icon: Waypoints, tint: PUZZLE },
  crossword: { icon: Grid2x2, tint: PUZZLE },
  scramble: { icon: Shuffle, tint: PUZZLE },
  cryptogram: { icon: KeyRound, tint: PUZZLE },
  dot_to_dot: { icon: Spline, tint: PUZZLE },
  coloring: { icon: Palette, tint: KIDS },
  activity: { icon: Layers, tint: KIDS },
  tracing: { icon: PenLine, tint: KIDS },
  math: { icon: Calculator, tint: KIDS },
  story: { icon: Sparkles, tint: KIDS },
  lowcontent: { icon: NotebookPen, tint: TEXT },
  ebook: { icon: BookOpen, tint: TEXT },
};

const FALLBACK: BookTypeMeta = { icon: BookOpen, tint: "#71717a" };

export function bookTypeMeta(type: string): BookTypeMeta {
  return BOOK_TYPE_META[type as BookType] ?? FALLBACK;
}
