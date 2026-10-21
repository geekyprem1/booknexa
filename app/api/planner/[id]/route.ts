import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { addWeeks, isWeekStart, normalizeAsin, weekStartUtc, type PubStatus } from "@/lib/planner/core";
import {
  getSlotLimit,
  plannerUser,
  publicationsForWeeks,
  PUBLICATION_COLUMNS,
  slotAvailable,
  type PublicationRow,
} from "@/lib/planner/store";
import { isUuid } from "@/lib/shelves/store";
import { badRequest, jsonBody, notFound, serverError } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const STATUSES: PubStatus[] = ["planned", "published", "skipped"];

async function load(userId: string, id: string): Promise<PublicationRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await getSupabaseAdminClient()
    .from("publications")
    .select(PUBLICATION_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as PublicationRow | null) ?? null;
}

/**
 * Move to another week, change status, record the ASIN / publish date, or edit notes:
 * { weekStart?, status?, asin?, publishedAt?, notes? }.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await plannerUser("planner-write", 30);
  if (userId instanceof Response) return userId;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  try {
    const pub = await load(userId, id);
    if (!pub) return notFound("Slot");
    const patch: Record<string, unknown> = {};

    let week = pub.week_start;
    if (body.weekStart !== undefined) {
      if (!isWeekStart(body.weekStart)) return badRequest("weekStart must be a Sunday (YYYY-MM-DD)");
      const now = weekStartUtc();
      if (body.weekStart < addWeeks(now, -104) || body.weekStart > addWeeks(now, 104)) return badRequest("That week is too far away");
      week = body.weekStart;
      patch.week_start = week;
    }

    let status = pub.status;
    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status as PubStatus)) return badRequest("Invalid status");
      status = body.status as PubStatus;
      patch.status = status;
      if (status === "published" && !pub.published_at && body.publishedAt === undefined) patch.published_at = new Date().toISOString();
      if (status !== "published") patch.published_at = null;
    }

    if (body.publishedAt !== undefined && status === "published") {
      const d = body.publishedAt === null ? null : new Date(String(body.publishedAt));
      if (d && Number.isNaN(d.getTime())) return badRequest("Invalid publish date");
      patch.published_at = d ? d.toISOString() : new Date().toISOString();
    }

    if (body.asin !== undefined) {
      if (body.asin === null || body.asin === "") patch.asin = null;
      else {
        const asin = normalizeAsin(body.asin);
        if (!asin) return badRequest("ASIN must be 10 letters or digits");
        patch.asin = asin;
      }
    }

    if (body.notes !== undefined) {
      const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 500) : "";
      patch.notes = notes || null;
    }

    if (!Object.keys(patch).length) return badRequest("Nothing to update");

    // Re-check the cap when the row starts holding a slot in a (possibly new) week.
    const movesWeek = week !== pub.week_start;
    const unskips = pub.status === "skipped" && status !== "skipped";
    if (status !== "skipped" && (movesWeek || unskips)) {
      const limit = await getSlotLimit(userId);
      const pubs = await publicationsForWeeks(userId, [week]);
      if (!slotAvailable(pubs, week, pub.format, limit, pub.id)) {
        return NextResponse.json(
          { error: `That week's ${pub.format} slots are full (${limit}/${limit}).`, code: "SLOT_FULL" },
          { status: 409 }
        );
      }
    }

    patch.updated_at = new Date().toISOString();
    const { data, error } = await getSupabaseAdminClient()
      .from("publications")
      .update(patch)
      .eq("id", pub.id)
      .eq("user_id", userId)
      .select(PUBLICATION_COLUMNS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound("Slot");
    return NextResponse.json({ publication: data });
  } catch (e) {
    return serverError("planner update", e);
  }
}

/** Free the slot. The book goes back to the backlog. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const userId = await plannerUser("planner-write", 30);
  if (userId instanceof Response) return userId;
  if (!isUuid(id)) return notFound("Slot");

  const { data, error } = await getSupabaseAdminClient()
    .from("publications")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) return serverError("planner delete", error);
  if (!data) return notFound("Slot");
  return NextResponse.json({ ok: true });
}
