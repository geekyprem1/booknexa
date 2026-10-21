import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured } from "@/lib/storage";
import { enqueue } from "@/lib/jobs/job-queue";
import { costFor, type Feature } from "@/lib/billing";
import { assertFeature, billingErrorResponse } from "@/lib/billing/guard";
import { parseBookRequest } from "@/lib/books/request";
import { MAX_VOLUMES_PER_REQUEST, renderTitle, volumeBadge, volumeTheme } from "@/lib/shelves/core";
import { getSeries, getShelf, shelfCoverStyle, takeVolume, volumeTaken } from "@/lib/shelves/store";
import { penNameGate } from "@/lib/publishing/pen-name";
import { badRequest, jsonBody, notFound, serverError, shelfRouteUser } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueuedVolume { volumeNo: number; jobId: string; title: string; cost: number }
interface FailedVolume { volumeNo?: number; error: string; status: number }

/**
 * Queue the next volume(s) of a series: { count?: 1–5, volumeNo? }.
 * Each volume re-runs the series' stored request with a fresh seed, the series
 * title pattern, the shelf's pen name + colors and a "VOL. n" cover badge.
 * Volumes are queued one by one; if credits run out midway, the ones already
 * queued stay queued and the rest come back in `failed`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await shelfRouteUser("series-volumes", 10);
  if (user instanceof Response) return user;
  if (!isStorageConfigured()) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const count = body.count === undefined ? 1 : Number(body.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_VOLUMES_PER_REQUEST) {
    return badRequest(`count must be 1–${MAX_VOLUMES_PER_REQUEST}`);
  }
  let explicitVolume: number | undefined;
  if (body.volumeNo !== undefined && body.volumeNo !== null) {
    explicitVolume = Number(body.volumeNo);
    if (!Number.isInteger(explicitVolume) || explicitVolume < 1 || explicitVolume > 9999) return badRequest("Invalid volume number");
    if (count !== 1) return badRequest("volumeNo works with count = 1");
  }

  let series, shelf;
  try {
    series = await getSeries(user.id, id);
    if (!series) return notFound("Series");
    shelf = await getShelf(user.id, series.shelf_id);
    if (!shelf) return notFound("Shelf");
    if (explicitVolume && (await volumeTaken(series.id, explicitVolume))) {
      return NextResponse.json({ error: `Vol. ${explicitVolume} already exists in this series.` }, { status: 409 });
    }
  } catch (e) {
    return serverError("load series", e);
  }

  const needsPenName = await penNameGate(user.id, shelf.pen_name);
  if (needsPenName) return needsPenName;

  const base = series.base_input ?? {};
  const queued: QueuedVolume[] = [];
  const failed: FailedVolume[] = [];

  for (let i = 0; i < count; i++) {
    let volumeNo: number | undefined;
    try {
      // Validate before taking a number so a bad stored request doesn't burn volumes.
      const probe = parseBookRequest({ ...base, bookType: series.book_type });
      if (!probe.ok) return badRequest(`This series' settings are no longer valid: ${probe.error}`);
      const cost = costFor(probe.bookType, { count: probe.count });
      await assertFeature(user.id, probe.bookType as Feature);

      volumeNo = await takeVolume(user.id, series.id, explicitVolume);
      const title = renderTitle(series.title_pattern, { name: series.name, n: volumeNo });
      const theme = volumeTheme(probe.input.theme, series.subthemes ?? [], volumeNo);
      const parsed = parseBookRequest({ ...base, bookType: series.book_type, theme, title });
      if (!parsed.ok) throw new Error(parsed.error);

      const jobId = await enqueue(user.id, {
        jobType: parsed.bookType,
        bookType: parsed.bookType,
        title,
        input: {
          ...parsed.input,
          author: shelf.pen_name ?? undefined,
          coverStyle: { ...shelfCoverStyle(shelf), badge: volumeBadge(volumeNo) },
          shelfId: shelf.id,
          seriesId: series.id,
          volumeNo,
          _cost: cost,
          _action: parsed.bookType,
        },
      });
      queued.push({ volumeNo, jobId, title, cost });
    } catch (e) {
      const billing = billingErrorResponse(e);
      if (billing) {
        const json = (await billing.json()) as { error?: string };
        failed.push({ volumeNo, error: json.error ?? "Not allowed", status: billing.status });
        // Credits/plan/caps won't change within this request — stop here.
        break;
      }
      console.error("[shelves] queue volume failed:", e);
      failed.push({ volumeNo, error: "Could not queue this volume", status: 500 });
      break;
    }
  }

  if (!queued.length) {
    const first = failed[0];
    return NextResponse.json({ error: first?.error ?? "Nothing queued", queued, failed }, { status: first?.status ?? 500 });
  }
  return NextResponse.json({ queued, failed });
}
