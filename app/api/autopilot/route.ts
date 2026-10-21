import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isStorageConfigured } from "@/lib/storage";
import { generateBookAngles, isAiConfigured } from "@/lib/ai";
import { enqueue } from "@/lib/jobs/job-queue";
import { costFor, getBalance, getOrCreateSubscription, isUnlimited } from "@/lib/billing";
import { assertFeature, billingErrorResponse } from "@/lib/billing/guard";
import { GenerationInputError, normalizeFiniteInteger } from "@/lib/generation-input";
import { KDP_TRIM_OPTIONS } from "@/lib/pdf/kdp-specs";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { penNameGate } from "@/lib/publishing/pen-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BOOKS_PER_RUN = 3;
const WORDS_PER_CHAPTER = 2500;
const ROLLING_WINDOW_DAYS = 30;
const ALLOWED_TRIMS = new Set<string>(KDP_TRIM_OPTIONS.map((t) => t.value));

/** Format an ISO timestamp as a plain date for user-facing messages. */
function formatDate(iso: string | undefined): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "soon" : d.toLocaleDateString("en-US", { dateStyle: "medium" });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const rl = rateLimit(`autopilot:${user.id}`, 3);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "Autopilot needs OpenRouter — set OPENROUTER_API_KEY on the server." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const niche = typeof body.niche === "string" ? body.niche.trim() : "";
  if (!niche) return NextResponse.json({ error: "Niche / topic is required" }, { status: 400 });
  const audience = typeof body.audience === "string" ? body.audience.trim() : undefined;
  const author = typeof body.author === "string" ? body.author.trim() : undefined;

  const trimSize = typeof body.trimSize === "string" ? body.trimSize : "6x9";
  if (!ALLOWED_TRIMS.has(trimSize)) {
    return NextResponse.json({ error: "Unsupported trim size" }, { status: 400 });
  }

  let wordsPerBook: number;
  try {
    wordsPerBook = normalizeFiniteInteger(body.wordsPerBook, {
      field: "wordsPerBook",
      min: 5000,
      max: 50000,
      defaultValue: 25000,
    });
  } catch (error) {
    if (error instanceof GenerationInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const chapterCount = Math.max(5, Math.min(20, Math.round(wordsPerBook / WORDS_PER_CHAPTER)));
  const costPerBook = costFor("ebook", { chapterCount });
  const totalCost = costPerBook * BOOKS_PER_RUN;

  // No author on the form and none in the profile → ask for a pen name before
  // claiming the monthly lock.
  const needsPenName = await penNameGate(user.id, author);
  if (needsPenName) return needsPenName;

  // Feature gate + affordability pre-check BEFORE claiming the monthly lock, so a
  // user who can't afford the run doesn't burn their one monthly slot.
  try {
    await assertFeature(user.id, "autopilot");
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }
  const sub = await getOrCreateSubscription(user.id);
  const balance = await getBalance(user.id);
  if (!isUnlimited(sub.entitlements) && balance < totalCost) {
    return NextResponse.json(
      { error: "Not enough credits for 3 books.", upgrade: true, requiredCredits: totalCost, currentCredits: balance },
      { status: 402 }
    );
  }

  // 3 distinct angles within the niche (has a deterministic fallback). Stored with
  // a per-book status the progress page reads as each book is written.
  const angles = await generateBookAngles({ niche, audience });
  const angleRows = angles.slice(0, BOOKS_PER_RUN).map((a) => ({
    title: a.title,
    angle: a.angle,
    status: "pending" as const,
  }));

  const admin = getSupabaseAdminClient();

  // Claim a slot atomically. The RPC takes a per-user advisory lock, then inserts
  // only when the last run is older than the rolling 30-day window — no race.
  const { data: claim, error: claimError } = await admin.rpc("autopilot_claim_run", {
    p_user: user.id,
    p_niche: niche,
    p_audience: audience ?? null,
    p_author: author ?? null,
    p_words: wordsPerBook,
    p_trim: trimSize,
    p_angles: angleRows,
    p_window_days: ROLLING_WINDOW_DAYS,
  });

  if (claimError) {
    console.error("autopilot claim failed:", claimError);
    return NextResponse.json({ error: "Could not start Autopilot." }, { status: 500 });
  }
  const claimResult = claim as { outcome?: string; run_id?: string; next_at?: string } | null;
  if (claimResult?.outcome === "locked") {
    return NextResponse.json(
      {
        error: `Autopilot can only run once every ${ROLLING_WINDOW_DAYS} days. You can run it again on ${formatDate(claimResult.next_at)}.`,
        monthlyLimit: true,
        nextRunAt: claimResult.next_at ?? null,
      },
      { status: 403 }
    );
  }
  if (claimResult?.outcome !== "ok" || !claimResult.run_id) {
    console.error("autopilot claim returned unexpected result:", claimResult);
    return NextResponse.json({ error: "Could not start Autopilot." }, { status: 500 });
  }
  const runId = claimResult.run_id;

  // One background job writes all 3 books sequentially (see autopilot-pipeline).
  // Credits are reserved/refunded per book inside the pipeline (retry-safe), so the
  // job itself carries no reservation.
  let jobId: string;
  try {
    jobId = await enqueue(user.id, {
      jobType: "autopilot",
      bookType: "ebook",
      title: `Autopilot · ${niche}`,
      input: {
        runId,
        audience,
        author,
        trimSize,
        chapterCount,
        targetWords: wordsPerBook,
        costPerBook,
        _cost: 0, // credits handled per book in the pipeline
        _action: "autopilot",
      },
    });
  } catch (enqueueError) {
    // Nothing reserved yet — just release the slot.
    await admin.from("autopilot_runs").delete().eq("id", runId);
    console.error("autopilot enqueue failed:", enqueueError);
    return NextResponse.json({ error: "Could not start Autopilot." }, { status: 500 });
  }

  await admin.from("autopilot_runs").update({ job_ids: [jobId] }).eq("id", runId);

  return NextResponse.json({ runId, jobIds: [jobId], count: BOOKS_PER_RUN, cost: totalCost });
}
