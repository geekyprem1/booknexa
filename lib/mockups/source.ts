/**
 * Load everything a book's mockups need: front/spine images, interior previews,
 * the series' other volumes, and the text (title, author, bullets). Server-only.
 */

import { getSupabaseAdminClient } from "../supabase/admin";
import { getBytes } from "../storage";
import { BOOK_TYPE_LABELS, type BookType } from "../opportunity";
import { loadPublishingProfile, profileAuthor } from "../publishing/profile";
import { normalizeCoverStyle } from "../shelves/core";
import { TRIM_SIZES, type TrimSize } from "../pdf/kdp-specs";
import { KINDLE_COVER_PX } from "../cover/kindle";
import { isOwnAssetKey, readAssets, type BookAssets } from "./assets";
import type { MockupAvailability, MockupKind } from "./kinds";
import type { ImageRef, MockupInputs } from "./templates";
import { toDataUri } from "./render";

const DEFAULT_ACCENT = "#1f3a5f";
const MAX_VOLUMES = 6;

interface BookRow {
  id: string;
  title: string;
  book_type: string;
  status: string;
  page_count: number | null;
  puzzle_count: number | null;
  trim_size: string | null;
  cover_key: string | null;
  assets: unknown;
  series_id: string | null;
  volume_no: number | null;
  shelf_id: string | null;
  config: Record<string, unknown> | null;
  book_metadata: { subtitle: string | null; description: string | null }[] | { subtitle: string | null; description: string | null } | null;
}

const BOOK_COLUMNS =
  "id, title, book_type, status, page_count, puzzle_count, trim_size, cover_key, assets, series_id, volume_no, shelf_id, config, book_metadata(subtitle, description)";

export interface LoadedMockupSource {
  book: BookRow;
  assets: BookAssets;
  inputs: MockupInputs;
  availability: MockupAvailability;
}

/** Front (+ spine) images for one book, or null if it has no usable cover image. */
async function coverImages(userId: string, book: Pick<BookRow, "id" | "cover_key" | "assets">): Promise<{ front: ImageRef; spine: ImageRef | null; spineIn: number; trimH: number } | null> {
  // A Cover Studio PNG applied to the book wins: it's a front cover only.
  if (book.cover_key && book.cover_key.endsWith(".png")) {
    try {
      return { front: { src: toDataUri(await getBytes(book.cover_key)) }, spine: null, spineIn: 0, trimH: 0 };
    } catch {
      /* fall through to the stored wrap */
    }
  }
  const c = readAssets(book.assets).cover;
  if (!c || !isOwnAssetKey(c.key, userId, book.id)) return null;
  const src = toDataUri(await getBytes(c.key));
  const base = { fullW: c.fullWidthIn, fullH: c.fullHeightIn, y: c.bleedIn, h: c.trimHeightIn };
  return {
    front: { src, crop: { ...base, x: c.frontStartIn, w: c.panelWidthIn } },
    spine: c.spineWidthIn > 0.05 ? { src, crop: { ...base, x: c.spineStartIn, w: c.spineWidthIn } } : null,
    spineIn: c.spineWidthIn,
    trimH: c.trimHeightIn,
  };
}

/** Up to three short selling points from the description's "- " bullets, else from the book's facts. */
const PUZZLE_TYPES = new Set(["word_search", "sudoku", "maze", "scramble", "cryptogram", "crossword"]);

export function bulletsFor(description: string | null | undefined, facts: { pages?: number | null; puzzles?: number | null; bookType: string; trim?: string | null }): string[] {
  const fromDesc = (description ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^[-•*]\s+/.test(l))
    .map((l) => l.replace(/^[-•*]\s+/, "").replace(/\s+/g, " "))
    .filter((l) => l.length >= 8)
    .map((l) => (l.length > 80 ? `${l.slice(0, 77).trimEnd()}…` : l));
  if (fromDesc.length >= 3) return fromDesc.slice(0, 3);
  const facts2 = [
    facts.puzzles && PUZZLE_TYPES.has(facts.bookType) ? `${facts.puzzles} puzzles inside` : null,
    facts.pages ? `${facts.pages} pages` : null,
    facts.trim && facts.bookType !== "ebook" ? `${facts.trim.replace("x", " × ")} inch paperback` : null,
  ].filter((x): x is string => Boolean(x));
  return [...fromDesc, ...facts2].slice(0, 3);
}

/**
 * Cheap availability check for the UI (no image downloads). Returns null if the
 * book can't be read; tolerates a database without the assets column.
 */
export async function quickMockupState(
  userId: string,
  bookId: string
): Promise<{ availability: MockupAvailability; mockups: Partial<Record<MockupKind, string>>; mockupsAt: string | null } | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("books")
    .select("id, cover_key, assets, series_id")
    .eq("id", bookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const assets = readAssets(data.assets);
  const hasCover = Boolean((data.cover_key as string | null)?.endsWith(".png") || assets.cover);
  let seriesVolumes = 0;
  if (data.series_id) {
    const { data: sib } = await admin
      .from("books")
      .select("cover_key, assets")
      .eq("user_id", userId)
      .eq("series_id", data.series_id)
      .eq("status", "completed")
      .limit(MAX_VOLUMES);
    seriesVolumes = (sib ?? []).filter((s) => (s.cover_key as string | null)?.endsWith(".png") || readAssets(s.assets).cover).length;
  }
  return {
    availability: { hasCover, previewCount: assets.previews?.length ?? 0, seriesVolumes },
    mockups: assets.mockups ?? {},
    mockupsAt: assets.mockupsAt ?? null,
  };
}

export async function loadMockupSource(userId: string, bookId: string): Promise<LoadedMockupSource | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.from("books").select(BOOK_COLUMNS).eq("id", bookId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const book = data as unknown as BookRow;
  const assets = readAssets(book.assets);
  const meta = Array.isArray(book.book_metadata) ? book.book_metadata[0] : book.book_metadata;

  const trim = TRIM_SIZES[(book.trim_size ?? "") as TrimSize] ?? TRIM_SIZES[book.book_type === "ebook" ? "6x9" : "8.5x11"];
  const images = await coverImages(userId, book);

  const previews: string[] = [];
  for (const key of assets.previews ?? []) {
    if (!isOwnAssetKey(key, userId, book.id)) continue;
    try {
      previews.push(toDataUri(await getBytes(key)));
    } catch {
      /* a missing preview just drops that kind */
    }
  }

  const volumes: ImageRef[] = [];
  if (book.series_id) {
    const { data: siblings } = await admin
      .from("books")
      .select("id, cover_key, assets, volume_no")
      .eq("user_id", userId)
      .eq("series_id", book.series_id)
      .eq("status", "completed")
      .order("volume_no")
      .limit(MAX_VOLUMES);
    for (const s of siblings ?? []) {
      const img = s.id === book.id ? images : await coverImages(userId, s as Pick<BookRow, "id" | "cover_key" | "assets">);
      if (img) volumes.push(img.front);
    }
  }

  let accent = DEFAULT_ACCENT;
  if (book.shelf_id) {
    const { data: shelf } = await admin.from("shelves").select("cover_style").eq("id", book.shelf_id).eq("user_id", userId).maybeSingle();
    accent = normalizeCoverStyle(shelf?.cover_style).background ?? DEFAULT_ACCENT;
  }

  const author = (typeof book.config?.author === "string" && book.config.author.trim()) || profileAuthor(await loadPublishingProfile(userId));
  const typeLabel = BOOK_TYPE_LABELS[book.book_type as BookType] ?? "Book";
  const trimH = images?.trimH || trim.heightIn;

  return {
    book,
    assets,
    availability: { hasCover: Boolean(images), previewCount: previews.length, seriesVolumes: volumes.length },
    inputs: {
      front: images?.front ?? null,
      spine: images?.spine ?? null,
      spineRatio: images?.spineIn ? images.spineIn / trimH : 0.02,
      // Kindle covers are 1600 × 2560 px, not a print trim.
      aspect: book.book_type === "ebook" ? KINDLE_COVER_PX.width / KINDLE_COVER_PX.height : trim.widthIn / trim.heightIn,
      previews,
      volumes,
      title: book.title,
      subtitle: meta?.subtitle ?? "",
      author,
      typeLabel,
      bullets: bulletsFor(meta?.description, { pages: book.page_count, puzzles: book.puzzle_count, bookType: book.book_type, trim: book.trim_size }),
      accent,
    },
  };
}
