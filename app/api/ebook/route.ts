import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isStorageConfigured } from "@/lib/storage";
import { enqueue } from "@/lib/jobs/job-queue";
import { costFor, refund, reserve } from "@/lib/billing";
import { assertFeature, billingErrorResponse } from "@/lib/billing/guard";
import { GenerationInputError, normalizeFiniteInteger } from "@/lib/generation-input";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { penNameGate } from "@/lib/publishing/pen-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enqueue a background ebook generation job and return immediately. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`ebook:${user.id}`, 10);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!isStorageConfigured()) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = typeof body.theme === "string" ? body.theme.trim() : typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  const userTitle = typeof body.title === "string" ? body.title.trim() : "";

  let chapterCount: number;
  let targetWords: number;
  try {
    chapterCount = normalizeFiniteInteger(body.chapterCount, { field: "chapterCount", min: 3, max: 30, defaultValue: 10 });
    targetWords = normalizeFiniteInteger(body.targetWords, { field: "targetWords", min: 2000, max: 50000, defaultValue: 8000 });
  } catch (error) {
    if (error instanceof GenerationInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const input = {
    theme: topic,
    title: userTitle || undefined,
    audience: typeof body.audience === "string" ? body.audience : undefined,
    tone: typeof body.tone === "string" ? body.tone : undefined,
    chapterCount,
    targetWords,
    opportunity: body.opportunity && typeof body.opportunity === "object" ? body.opportunity : undefined,
  };
  const cost = costFor("ebook", { chapterCount });

  const needsPenName = await penNameGate(user.id);
  if (needsPenName) return needsPenName;

  try {
    await assertFeature(user.id, "ebook");
    await reserve(user.id, cost, "job");
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const jobId = await enqueue(user.id, {
      jobType: "ebook",
      bookType: "ebook",
      title: userTitle || topic,
      input: { ...input, _cost: cost, _action: "ebook" },
    });
    return NextResponse.json({ jobId, cost });
  } catch (enqueueError) {
    const billingResponse = billingErrorResponse(enqueueError);
    if (billingResponse) return billingResponse;
    // job_create_with_reservation is atomic: a failed enqueue did not debit
    // credits, so compensating here would incorrectly add free credits.
    console.error("ebook enqueue failed", enqueueError);
    return NextResponse.json({ error: "Could not queue ebook generation" }, { status: 500 });
  }
}
