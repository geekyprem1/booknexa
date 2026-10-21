import { NextRequest, NextResponse } from "next/server";
import { MAX_WEEKS, suggestFill, weekRange, weekStartUtc } from "@/lib/planner/core";
import { getSlotLimit, loadBacklog, plannerUser, publicationsBetween } from "@/lib/planner/store";
import { jsonBody, serverError } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Suggest how to fill the free slots from this week onward: { weeks?: 1–12 }.
 * Read-only — the client shows the list and applies it via POST /api/planner { items }.
 */
export async function POST(req: NextRequest) {
  const userId = await plannerUser("planner-suggest", 20);
  if (userId instanceof Response) return userId;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const n = Math.min(MAX_WEEKS, Math.max(1, Number(body.weeks) || 4));
  const today = weekStartUtc();
  const weeks = weekRange(today, n);

  try {
    const [limit, pubs, backlog] = await Promise.all([
      getSlotLimit(userId),
      publicationsBetween(userId, weeks[0], weeks[weeks.length - 1]),
      loadBacklog(userId),
    ]);
    const titles = new Map(backlog.map((b) => [b.id, b.title]));
    const suggestions = suggestFill(backlog, pubs, weeks, limit, today)
      .slice(0, 20)
      .map((s) => ({ ...s, title: titles.get(s.bookId) ?? "" }));
    return NextResponse.json({ suggestions, limit });
  } catch (e) {
    return serverError("planner suggest", e);
  }
}
