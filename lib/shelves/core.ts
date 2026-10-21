/**
 * Shelf Suite — pure helpers (no I/O). Safe to import from tests and routes.
 */

import type { CoverStyle } from "../pdf/cover-style";

export const DEFAULT_TITLE_PATTERN = "{name}, Vol. {n}";
export const MAX_VOLUMES_PER_REQUEST = 5;
export const MAX_SUBTHEMES = 30;
const MAX_SUBTHEME_LEN = 60;
const HEX = /^#[0-9a-f]{6}$/i;

/** Keys that describe one specific book/job rather than the series' reusable request. */
const NON_BASE_KEYS = new Set([
  "title", "opportunity", "author", "seed", "coverStyle", "shelfId", "seriesId", "volumeNo",
]);

/** "{name}, Vol. {n}" → "Garden Word Search, Vol. 3". Unknown placeholders are dropped. */
export function renderTitle(pattern: string, vars: { name: string; n: number }): string {
  const out = pattern
    .replace(/\{name\}/g, vars.name)
    .replace(/\{n\}/g, String(vars.n))
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return out.slice(0, 200);
}

/** Valid pattern: 3–200 chars and contains {n} (mirrors the DB check). */
export function isValidTitlePattern(pattern: unknown): pattern is string {
  return typeof pattern === "string" && pattern.trim().length >= 3 && pattern.length <= 200 && pattern.includes("{n}");
}

/**
 * Theme for volume n. With subthemes, cycle through them so each volume gets a
 * different word list (a new seed alone only changes the grids).
 */
export function volumeTheme(baseTheme: string | undefined, subthemes: string[], n: number): string | undefined {
  if (!baseTheme) return baseTheme;
  if (!subthemes.length || n < 1) return baseTheme;
  const sub = subthemes[(n - 1) % subthemes.length];
  return `${baseTheme}: ${sub}`.slice(0, 200);
}

/** Strip job bookkeeping (_cost, _action) and per-book fields from a stored job input. */
export function baseInputFromJob(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input)) {
    if (k.startsWith("_") || NON_BASE_KEYS.has(k) || v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

/** Reconstruct a request from the books row when the original job is gone. */
export function baseInputFromBook(book: {
  theme?: string | null;
  difficulty?: string | null;
  puzzle_count?: number | null;
  trim_size?: string | null;
  book_type: string;
  config?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const cfg = book.config ?? {};
  const out: Record<string, unknown> = {};
  if (book.theme) out.theme = book.theme;
  if (book.difficulty) out.difficulty = book.difficulty;
  if (book.puzzle_count) out.count = book.puzzle_count;
  if (cfg.largePrint === true) out.largePrint = true;
  for (const k of ["ageGroup", "style", "layout", "set", "operation"]) {
    if (typeof cfg[k] === "string") out[k] = cfg[k];
  }
  if (book.book_type === "lowcontent") {
    out.layout = typeof cfg.layout === "string" ? cfg.layout : book.difficulty ?? undefined;
    if (book.trim_size) out.trim = book.trim_size;
    if (typeof cfg.pageCount === "number") out.count = cfg.pageCount;
  }
  if (book.book_type === "math" && typeof cfg.difficulty === "string") out.difficulty = cfg.difficulty;
  return out;
}

/** Accept only #rrggbb colors; anything else is dropped. */
export function normalizeCoverStyle(raw: unknown): Pick<CoverStyle, "background" | "spineColor"> {
  const out: Pick<CoverStyle, "background" | "spineColor"> = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.background === "string" && HEX.test(r.background)) out.background = r.background.toLowerCase();
  if (typeof r.spineColor === "string" && HEX.test(r.spineColor)) out.spineColor = r.spineColor.toLowerCase();
  return out;
}

/** Trim, de-duplicate (case-insensitive) and cap a subtheme list. */
export function normalizeSubthemes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const s = item.replace(/\s+/g, " ").trim().slice(0, MAX_SUBTHEME_LEN);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_SUBTHEMES) break;
  }
  return out;
}

/** Optional trimmed text field: undefined = not provided, null = clear. */
export function optionalText(raw: unknown, max: number): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== "string") return undefined;
  const s = raw.replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}

/** Remove a trailing "Vol. 3" / "Volume 3" / "#3" so a book title can seed a series name. */
export function seriesNameFromTitle(title: string): string {
  const cleaned = title
    .replace(/[\s,:–-]*(?:vol\.?|volume|book|#)\s*\d+\s*$/i, "")
    .trim();
  return (cleaned || title).slice(0, 160);
}

export const volumeBadge = (n: number): string => `VOL. ${n}`;
