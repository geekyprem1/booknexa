import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAdmin } from "@/lib/admin";
import { isStorageConfigured } from "@/lib/storage";
import { enqueue } from "@/lib/jobs/job-queue";
import { costFor, reserve } from "@/lib/billing";
import { billingErrorResponse } from "@/lib/billing/guard";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { penNameGate } from "@/lib/publishing/pen-name";
import { isImageConfigured } from "@/lib/generators/story-poc/images";
import {
  STORY_AGE_RANGES,
  STORY_ART_STYLES,
  MIN_STORY_PAGES,
  MAX_STORY_PAGES,
  DEFAULT_STORY_PAGES,
} from "@/lib/generators/story/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clampPages = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_STORY_PAGES;
  return Math.min(MAX_STORY_PAGES, Math.max(MIN_STORY_PAGES, Math.round(v)));
};

/** Enqueue a background story-book generation job and return immediately. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // Story Book is an internal, admin-only tool (highest per-book image cost). It is
  // not part of any plan or OTO. Non-admins must not even see it exists.
  const admin = await resolveAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rl = rateLimit(`storybook:${user.id}`, 6);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!isStorageConfigured()) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  // Reference-conditioned illustration is the whole point of this book type — a
  // real book cannot be produced without an image backend configured.
  if (!isImageConfigured()) {
    return NextResponse.json(
      { error: "Story Book image generation is not configured (SILICONFLOW_API_KEY)." },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idea = typeof body.idea === "string" ? body.idea.trim() : typeof body.theme === "string" ? body.theme.trim() : "";
  if (!idea) return NextResponse.json({ error: "Story idea is required" }, { status: 400 });
  if (idea.length > 300) return NextResponse.json({ error: "Story idea is too long" }, { status: 400 });

  const ageRange = STORY_AGE_RANGES.includes(body.ageRange as (typeof STORY_AGE_RANGES)[number])
    ? (body.ageRange as string)
    : "3-5";
  const artStyle = STORY_ART_STYLES.includes(body.artStyle as (typeof STORY_ART_STYLES)[number])
    ? (body.artStyle as string)
    : "watercolor";
  const pageCount = clampPages(body.pageCount);
  const userTitle = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";

  const input = {
    idea,
    title: userTitle || undefined,
    ageRange,
    artStyle,
    pageCount,
  };

  // count = illustrated pages (total minus title + end)
  const cost = costFor("storybook", { count: pageCount - 2 });

  const needsPenName = await penNameGate(user.id);
  if (needsPenName) return needsPenName;

  try {
    await reserve(user.id, cost, "job");
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const jobId = await enqueue(user.id, {
      jobType: "storybook",
      bookType: "storybook",
      title: userTitle || idea.slice(0, 80),
      input: { ...input, _cost: cost, _action: "storybook" },
    });
    return NextResponse.json({ jobId, cost });
  } catch (enqueueError) {
    const billingResponse = billingErrorResponse(enqueueError);
    if (billingResponse) return billingResponse;
    console.error("storybook enqueue failed", enqueueError);
    return NextResponse.json({ error: "Could not queue story book generation" }, { status: 500 });
  }
}
