/**
 * Apply a Cover Studio front image to a PRINT book.
 *
 * KDP paperbacks need one wraparound PDF (back | spine | front). A Studio image
 * is only the front, so instead of pointing `cover_key` at the PNG we build the
 * wrap around it and store it at the book's canonical cover.pdf key. The wrap
 * preview PNG (used by mockups) is refreshed best-effort.
 */

import { getSupabaseAdminClient } from "../supabase/admin";
import { requireMutationRow } from "../supabase/errors";
import { bookObjectKey, getBytes, putBookPdf, putBytes } from "../storage";
import { TRIM_SIZES, type TrimSize } from "../pdf/kdp-specs";
import { buildStudioWrapPdf, frontFitsTrim, renderWrapPreview } from "../cover/wrap";
import { coverAssetFromSpec, previewCoverKey, updateAssets } from "../mockups/assets";
import { loadPublishingProfile, profileAuthor } from "../publishing/profile";

/** The Studio image's shape doesn't match the book's trim (would crop the title). */
export class CoverTrimMismatchError extends Error {
  constructor(public readonly trim: string) {
    super(
      `This cover's shape doesn't fit a ${trim.replace("x", "×")} book. ` +
        `Make a cover at ${trim.replace("x", "×")} in Cover Studio and apply that one.`
    );
    this.name = "CoverTrimMismatchError";
  }
}

export class CoverNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoverNotReadyError";
  }
}

interface PrintBookRow {
  id: string;
  title: string;
  trim_size: string | null;
  page_count: number | null;
  config: Record<string, unknown> | null;
}

/** True for a Cover Studio variation key owned by this user (legacy cover_key values). */
export function isStudioCoverKey(key: string | null | undefined, userId: string): key is string {
  return typeof key === "string" && key.startsWith(`covers/${userId}/`) && key.endsWith(".png") && !key.includes("..");
}

/**
 * Build the wrap around `frontPng`, store it as the book's cover.pdf and point
 * `cover_key` at it. Returns the canonical cover key.
 */
export async function applyStudioCoverToPrintBook(userId: string, bookId: string, frontPng: Uint8Array): Promise<string> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("books")
    .select("id, title, trim_size, page_count, config, book_metadata(subtitle)")
    .eq("id", bookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CoverNotReadyError("Book not found");
  const book = data as unknown as PrintBookRow & { book_metadata: { subtitle: string | null }[] | { subtitle: string | null } | null };
  if (!book.page_count) throw new CoverNotReadyError("Finish generating the book first: the spine width needs its page count.");

  const trimRaw = book.trim_size ?? "8.5x11";
  if (!(trimRaw in TRIM_SIZES)) throw new CoverNotReadyError(`Unsupported trim size ${trimRaw}`);
  const trim = trimRaw as TrimSize;
  if (!frontFitsTrim(frontPng, trim)) throw new CoverTrimMismatchError(trim);

  const meta = Array.isArray(book.book_metadata) ? book.book_metadata[0] : book.book_metadata;
  const author =
    (typeof book.config?.author === "string" && book.config.author.trim()) ||
    profileAuthor(await loadPublishingProfile(userId));

  // Every print generator uses white paper (see lib/generators/*), so the spine
  // math matches the interior that was already built.
  const wrap = await buildStudioWrapPdf({
    frontPng,
    trim,
    pageCount: book.page_count,
    paper: "white",
    title: book.title,
    subtitle: meta?.subtitle ?? "",
    author,
  });

  const coverKey = bookObjectKey(userId, bookId, "cover");
  await putBookPdf(coverKey, wrap.pdf);
  const upd = await admin
    .from("books")
    .update({ cover_key: coverKey, updated_at: new Date().toISOString() })
    .eq("id", bookId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  requireMutationRow(upd, "Apply cover", "Book");

  // Mockups read the wrap preview; refresh it so they show the new art.
  try {
    const png = await renderWrapPreview(wrap);
    const key = previewCoverKey(userId, bookId);
    await putBytes(key, png, "image/png");
    await updateAssets(userId, bookId, { cover: coverAssetFromSpec(key, wrap.spec) });
  } catch (e) {
    console.warn("[cover] wrap preview refresh skipped:", e instanceof Error ? e.message : e);
  }
  return coverKey;
}

/**
 * Older print books had `cover_key` pointing straight at a Studio PNG, which
 * KDP rejects as a paperback cover. Convert one to a wrap PDF on first use.
 * Returns the cover key to serve (unchanged when nothing needed converting).
 */
export async function repairPrintCover(userId: string, book: { id: string; book_type: string; cover_key: string | null }): Promise<string | null> {
  if (book.book_type === "ebook" || !isStudioCoverKey(book.cover_key, userId)) return book.cover_key;
  return applyStudioCoverToPrintBook(userId, book.id, await getBytes(book.cover_key));
}
