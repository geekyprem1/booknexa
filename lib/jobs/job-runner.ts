/** Executes one fenced generation attempt. */

import { getSupabaseAdminClient } from "../supabase/admin";
import { generateAndStoreBook, normalizeSeed, type PipelineBookType } from "../books/pipeline";
import { generateAndStoreEbook } from "../books/ebook-pipeline";
import { generateAndStoreStorybook } from "../books/storybook-pipeline";
import { runAutopilotBooks } from "../books/autopilot-pipeline";
import { claimJob, markCompleted, markFailed, progressUpdater } from "./job-progress";
import { normalizeCoverStyle } from "../shelves/core";
import type { CoverStyle } from "../pdf/cover-style";

/** Re-validate the shelf/series cover style stored on the job input. */
function jobCoverStyle(raw: unknown): CoverStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const style: CoverStyle = normalizeCoverStyle(raw);
  const badge = (raw as Record<string, unknown>).badge;
  if (typeof badge === "string" && badge.trim()) style.badge = badge.trim().slice(0, 24);
  return style.background || style.spineColor || style.badge ? style : undefined;
}

async function discardFencedBook(bookId: string, userId: string): Promise<void> {
  const { data, error } = await getSupabaseAdminClient()
    .from("books")
    .delete()
    .eq("id", bookId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Could not discard fenced book ${bookId}`);
}

export async function runJob(jobId: string): Promise<void> {
  const job = await claimJob(jobId);
  if (!job) return;

  const onProgress = progressUpdater(jobId, job.attempt_token);
  const input = (job.input ?? {}) as Record<string, unknown>;
  const topic = typeof input.theme === "string" ? input.theme : undefined;
  const meta = topic ? { topic } : {};

  // Autopilot: one job writes 3 ebooks sequentially and manages its own
  // per-book credits/refunds, so it settles the job with 0 reserved cost.
  if (job.job_type === "autopilot") {
    try {
      const res = await runAutopilotBooks(job.user_id, input, onProgress);
      if (res.doneCount === 0 || !res.firstBookId) {
        await markFailed(
          jobId,
          job.attempt_token,
          res.firstError ?? "All books failed to generate",
          meta
        );
        return;
      }
      // A partial run still succeeded overall; books are linked via autopilot_run_id.
      await markCompleted(jobId, job.attempt_token, res.firstBookId, meta);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Autopilot failed";
      await markFailed(jobId, job.attempt_token, message, meta);
    }
    return;
  }

  let bookId: string;

  try {
    if (job.job_type === "storybook") {
      const result = await generateAndStoreStorybook(
        job.user_id,
        {
          idea: (input.idea as string) ?? (input.theme as string),
          title: input.title as string | undefined,
          ageRange: input.ageRange as string | undefined,
          artStyle: input.artStyle as string | undefined,
          pageCount: input.pageCount as number | undefined,
        },
        { onProgress }
      );
      bookId = result.id;
    } else if (job.job_type === "ebook") {
      const result = await generateAndStoreEbook(
        job.user_id,
        {
          topic: (input.theme as string) ?? (input.topic as string),
          audience: input.audience as string | undefined,
          tone: input.tone as string | undefined,
          chapterCount: input.chapterCount as number | undefined,
          targetWords: input.targetWords as number | undefined,
          title: input.title as string | undefined,
          author: input.author as string | undefined,
          trimSize: input.trimSize as string | undefined,
        },
        {
          opportunity: input.opportunity,
          autopilotRunId: (input.autopilotRunId as string | undefined) ?? null,
          onProgress,
        }
      );
      bookId = result.id;
    } else {
      const result = await generateAndStoreBook(
        job.user_id,
        {
          bookType: job.job_type as PipelineBookType,
          theme: input.theme as string | undefined,
          title: input.title as string | undefined,
          difficulty: input.difficulty as string | undefined,
          count: input.count as number | undefined,
          ageGroup: input.ageGroup as string | undefined,
          style: input.style as string | undefined,
          layout: input.layout as string | undefined,
          trim: input.trim as string | undefined,
          set: input.set as string | undefined,
          operation: input.operation as string | undefined,
          largePrint: input.largePrint === true,
          author: typeof input.author === "string" && input.author.trim() ? input.author.trim() : undefined,
          seed: normalizeSeed(input.seed),
          coverStyle: jobCoverStyle(input.coverStyle),
        },
        {
          opportunity: input.opportunity,
          shelfId: typeof input.shelfId === "string" ? input.shelfId : null,
          seriesId: typeof input.seriesId === "string" ? input.seriesId : null,
          volumeNo: Number.isInteger(input.volumeNo) && (input.volumeNo as number) > 0 ? (input.volumeNo as number) : null,
          onProgress,
        }
      );
      bookId = result.id;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    await markFailed(jobId, job.attempt_token, message, meta);
    return;
  }

  const completed = await markCompleted(jobId, job.attempt_token, bookId, meta);
  if (!completed) {
    // Cancellation/recovery/retry fenced this attempt while its pipeline was alive.
    // Remove its result so a newer attempt cannot leave a duplicate book record.
    await discardFencedBook(bookId, job.user_id);
  }
}
