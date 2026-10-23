/**
 * Shelf Suite — ebook series helpers (no I/O).
 *
 * Ebooks don't go through `parseBookRequest` (that's the print pipeline), so a
 * series of ebooks stores its own small request: topic + audience/tone +
 * chapter/word targets. Unlike puzzle books, a new seed doesn't make a new
 * ebook — every volume needs its own topic, so volumes take one subtheme each
 * and never cycle back to a used one.
 */

import { GenerationInputError, normalizeFiniteInteger } from "../generation-input";

export interface EbookSeriesInput {
  theme: string;
  audience?: string;
  tone?: string;
  chapterCount: number;
  targetWords: number;
}

export type ParsedEbookSeriesInput =
  | { ok: true; input: EbookSeriesInput }
  | { ok: false; error: string };

const text = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : undefined;
};

/** Validate an ebook request with the same bounds as /api/ebook. */
export function parseEbookSeriesInput(raw: Record<string, unknown>): ParsedEbookSeriesInput {
  const theme = text(raw.theme, 200) ?? text(raw.topic, 200);
  if (!theme) return { ok: false, error: "Topic is required" };
  try {
    const chapterCount = normalizeFiniteInteger(raw.chapterCount, { field: "chapterCount", min: 3, max: 30, defaultValue: 10 });
    const targetWords = normalizeFiniteInteger(raw.targetWords, { field: "targetWords", min: 2000, max: 50000, defaultValue: 8000 });
    const input: EbookSeriesInput = { theme, chapterCount, targetWords };
    const audience = text(raw.audience, 200);
    const tone = text(raw.tone, 200);
    if (audience) input.audience = audience;
    if (tone) input.tone = tone;
    return { ok: true, input };
  } catch (e) {
    if (e instanceof GenerationInputError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Rebuild an ebook request from its books row when the original job is gone. */
export function ebookInputFromBook(book: {
  theme?: string | null;
  difficulty?: string | null;
  puzzle_count?: number | null;
  config?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const cfg = book.config ?? {};
  const out: Record<string, unknown> = {};
  if (book.theme) out.theme = book.theme;
  const audience = typeof cfg.audience === "string" ? cfg.audience : book.difficulty;
  if (audience) out.audience = audience;
  if (typeof cfg.tone === "string") out.tone = cfg.tone;
  if (book.puzzle_count && book.puzzle_count >= 3 && book.puzzle_count <= 30) out.chapterCount = book.puzzle_count;
  return out;
}

/**
 * Topic for ebook volume n: "<theme>: <subtheme n>". Returns null when the
 * series has no subtheme for this volume yet (the caller asks for more).
 */
export function ebookVolumeTopic(theme: string, subthemes: string[], n: number): string | null {
  const sub = n >= 1 ? subthemes[n - 1] : undefined;
  return sub ? `${theme}: ${sub}`.slice(0, 200) : null;
}
