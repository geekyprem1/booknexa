import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isStorageConfigured } from "@/lib/storage";
import { enqueue } from "@/lib/jobs/job-queue";
import { costFor, reserve, type Feature } from "@/lib/billing";
import { assertFeature, billingErrorResponse } from "@/lib/billing/guard";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { parseBookRequest } from "@/lib/books/request";
import { getShelf, shelfCoverStyle } from "@/lib/shelves/store";
import { penNameGate } from "@/lib/publishing/pen-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enqueue a background generation job and return immediately. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`books:${user.id}`, 10);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!isStorageConfigured()) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseBookRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const { bookType, input, displayTitle, count } = parsed;
  const cost = costFor(bookType, { count });

  // Optional: file the new book on one of the user's shelves (pen name + colors follow).
  let shelfInput: Record<string, unknown> = {};
  if (body.shelfId !== undefined && body.shelfId !== null && body.shelfId !== "") {
    const shelf = await getShelf(user.id, String(body.shelfId));
    if (!shelf) return NextResponse.json({ error: "Shelf not found" }, { status: 404 });
    shelfInput = {
      shelfId: shelf.id,
      author: shelf.pen_name ?? undefined,
      coverStyle: shelfCoverStyle(shelf),
    };
  }

  const needsPenName = await penNameGate(user.id, shelfInput.author as string | undefined);
  if (needsPenName) return needsPenName;

  try {
    await assertFeature(user.id, bookType as Feature);
    await reserve(user.id, cost, "job");
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const jobId = await enqueue(user.id, {
      jobType: bookType,
      bookType,
      title: displayTitle,
      input: { ...input, ...shelfInput, _cost: cost, _action: bookType },
    });
    return NextResponse.json({ jobId, cost });
  } catch (enqueueError) {
    const billingResponse = billingErrorResponse(enqueueError);
    if (billingResponse) return billingResponse;
    // job_create_with_reservation is atomic: a failed enqueue did not debit
    // credits, so compensating here would incorrectly add free credits.
    console.error("book enqueue failed", enqueueError);
    return NextResponse.json({ error: "Could not queue book generation" }, { status: 500 });
  }
}
