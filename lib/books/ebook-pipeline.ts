/**
 * Shared ebook generate-and-store pipeline (used by the job runner). Reuses the
 * existing ebook generator + storage + DB; no generator changes.
 */

import { getSupabaseAdminClient } from "../supabase/admin";
import { requireMutationRow, requireMutationRows } from "../supabase/errors";
import { putBytes, bookObjectKey } from "../storage";
import { buildEbook } from "../generators/ebook";
import type { EbookCoverStyle } from "../generators/ebook/cover";
import { loadPublishingProfile, profileAuthor } from "../publishing/profile";
import { TRIM_SIZES, type TrimSize } from "../pdf/kdp-specs";

export interface EbookGenInput {
  topic: string;
  audience?: string;
  tone?: string;
  chapterCount?: number;
  targetWords?: number;
  title?: string;
  /** Author printed on the cover. Falls back to the user's Publishing Profile. */
  author?: string;
  /** KDP trim size stored on the book (defaults to 6x9). */
  trimSize?: string;
  /** Series volumes: shelf color, "VOL. n" badge, shared palette. */
  coverStyle?: EbookCoverStyle;
}

export interface StoredEbook {
  id: string;
  title: string;
  chapterCount: number;
}

export async function generateAndStoreEbook(
  userId: string,
  input: EbookGenInput,
  opts?: {
    opportunity?: unknown;
    autopilotRunId?: string | null;
    /** Shelf Suite grouping (series volumes). Only written when set, like the print pipeline. */
    shelfId?: string | null;
    seriesId?: string | null;
    volumeNo?: number | null;
    onProgress?: (step: string, percent: number) => void | Promise<void>;
  }
): Promise<StoredEbook> {
  const admin = getSupabaseAdminClient();
  const progress = async (step: string, pct: number) => {
    try { await opts?.onProgress?.(step, pct); } catch { /* best-effort */ }
  };

  // An explicit author (e.g. Autopilot) wins; otherwise inherit the
  // Publishing Profile author, same as before.
  const author = input.author?.trim() || profileAuthor(await loadPublishingProfile(userId));
  // Unknown trims fall back to 6x9 so the cover always matches the interior.
  const trimRaw = input.trimSize?.trim() || "6x9";
  const trim = (trimRaw in TRIM_SIZES ? trimRaw : "6x9") as TrimSize;
  const trimSize = trim;
  await progress("Outline & chapters", 20);
  const built = await buildEbook({
    topic: input.topic,
    audience: input.audience,
    tone: input.tone,
    chapterCount: input.chapterCount,
    targetWords: input.targetWords,
    title: input.title,
    author,
    trim,
    coverStyle: input.coverStyle,
  });
  await progress("Saving", 75);

  const grouping: Record<string, unknown> = {};
  if (opts?.shelfId) grouping.shelf_id = opts.shelfId;
  if (opts?.seriesId) grouping.series_id = opts.seriesId;
  if (opts?.volumeNo) grouping.volume_no = opts.volumeNo;

  const insertResult = await admin
    .from("books")
    .insert({
      user_id: userId,
      book_type: "ebook",
      theme: input.topic,
      title: built.title,
      status: "generating",
      difficulty: built.audience,
      puzzle_count: built.chapters.length,
      trim_size: trimSize,
      config: { audience: built.audience, tone: built.tone, author: built.author },
      opportunity: opts?.opportunity ?? null,
      autopilot_run_id: opts?.autopilotRunId ?? null,
      ...grouping,
    })
    .select("id")
    .single();
  const inserted = requireMutationRow(insertResult, "Create ebook");
  const bookId = inserted.id as string;

  try {
    const coverKey = bookObjectKey(userId, bookId, "cover");
    await putBytes(coverKey, built.coverBytes, "image/png");

    const chaptersResult = await admin.from("ebook_chapters").insert(
      built.chapters.map((c) => ({
        book_id: bookId, idx: c.idx, title: c.title, summary: c.summary,
        content_md: c.contentMd, word_count: c.wordCount, status: c.status,
      }))
    ).select("id");
    requireMutationRows(chaptersResult, built.chapters.length, "Save ebook chapters");

    const metadataResult = await admin.from("book_metadata").upsert({
      book_id: bookId, title: built.title, subtitle: built.subtitle,
      description: built.description, keywords: built.keywords, generated_by: built.metadataBy,
    }).select("book_id").single();
    requireMutationRow(metadataResult, "Save ebook metadata");

    await progress("Finalizing", 95);
    const completeResult = await admin.from("books").update({
      status: "completed", cover_key: coverKey, page_count: built.chapters.length, updated_at: new Date().toISOString(),
    }).eq("id", bookId).select("id").maybeSingle();
    requireMutationRow(completeResult, "Complete ebook", "Book");

    return { id: bookId, title: built.title, chapterCount: built.chapters.length };
  } catch (err) {
    const failedResult = await admin.from("books")
      .update({ status: "failed", error: err instanceof Error ? err.message : "Generation failed" })
      .eq("id", bookId)
      .select("id")
      .maybeSingle();
    try {
      requireMutationRow(failedResult, "Mark ebook failed", "Book");
    } catch (statusError) {
      console.error("[ebooks] could not persist failed status:", statusError);
    }
    throw err;
  }
}
