import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  addWeeks,
  formatForBook,
  isPubFormat,
  isWeekStart,
  MAX_WEEKS,
  slotUsage,
  weekRange,
  weekStartUtc,
  type PubFormat,
} from "@/lib/planner/core";
import {
  getSlotLimit,
  loadBacklog,
  plannerUser,
  publicationsBetween,
  publicationsForWeeks,
  PUBLICATION_COLUMNS,
  slotAvailable,
  type PublicationRow,
} from "@/lib/planner/store";
import { isUuid } from "@/lib/shelves/store";
import { badRequest, jsonBody, serverError } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BATCH = 20;
/** How far from today a slot may be planned (past weeks allow back-filling what's already live). */
const MAX_WEEKS_AWAY = 104;

/** Planner grid: slot usage per week, the publications in range, and the backlog. */
export async function GET(req: NextRequest) {
  const userId = await plannerUser("planner-read", 60);
  if (userId instanceof Response) return userId;

  const params = req.nextUrl.searchParams;
  const fromRaw = params.get("from");
  const from = fromRaw && isWeekStart(fromRaw) ? fromRaw : weekStartUtc();
  const weeksN = Math.min(MAX_WEEKS, Math.max(1, Number(params.get("weeks")) || 6));
  const weeks = weekRange(from, weeksN);

  try {
    const [limit, pubs, backlog] = await Promise.all([
      getSlotLimit(userId),
      publicationsBetween(userId, weeks[0], weeks[weeks.length - 1]),
      loadBacklog(userId),
    ]);
    const bookIds = [...new Set(pubs.map((p) => p.book_id))];
    const { data: books, error } = bookIds.length
      ? await getSupabaseAdminClient()
          .from("books")
          .select("id, title, book_type, series_id, volume_no, shelf_id")
          .eq("user_id", userId)
          .in("id", bookIds)
      : { data: [], error: null };
    if (error) throw error;
    return NextResponse.json({
      currentWeek: weekStartUtc(),
      limit,
      weeks: slotUsage(pubs, weeks, limit),
      publications: pubs,
      books: books ?? [],
      backlog,
    });
  } catch (e) {
    return serverError("planner read", e);
  }
}

interface PlanItem { bookId: string; format: PubFormat; weekStart: string }

function parseItem(raw: unknown): PlanItem | string {
  if (!raw || typeof raw !== "object") return "Invalid item";
  const r = raw as Record<string, unknown>;
  if (!isUuid(r.bookId)) return "Invalid book id";
  if (!isWeekStart(r.weekStart)) return "weekStart must be a Sunday (YYYY-MM-DD)";
  const now = weekStartUtc();
  if (r.weekStart < addWeeks(now, -MAX_WEEKS_AWAY) || r.weekStart > addWeeks(now, MAX_WEEKS_AWAY)) {
    return "That week is too far away";
  }
  if (r.format !== undefined && !isPubFormat(r.format)) return "Invalid format";
  return { bookId: r.bookId, format: (r.format as PubFormat | undefined) ?? ("" as PubFormat), weekStart: r.weekStart };
}

/**
 * Put books into week slots: { bookId, weekStart, format? } or { items: [...] } (≤ 20).
 * Format defaults to the book's own (ebook → ebook, everything else → paperback).
 * A full week returns code SLOT_FULL for that item.
 */
export async function POST(req: NextRequest) {
  const userId = await plannerUser("planner-write", 30);
  if (userId instanceof Response) return userId;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const rawItems = Array.isArray(body.items) ? body.items : [body];
  if (!rawItems.length || rawItems.length > MAX_BATCH) return badRequest(`Send 1–${MAX_BATCH} items`);
  const items: PlanItem[] = [];
  for (const raw of rawItems) {
    const parsed = parseItem(raw);
    if (typeof parsed === "string") return badRequest(parsed);
    items.push(parsed);
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: books, error } = await admin
      .from("books")
      .select("id, title, book_type, status")
      .eq("user_id", userId)
      .in("id", [...new Set(items.map((i) => i.bookId))]);
    if (error) throw error;
    const bookById = new Map((books ?? []).map((b) => [b.id as string, b]));

    const limit = await getSlotLimit(userId);
    const pubs: PublicationRow[] = await publicationsForWeeks(userId, items.map((i) => i.weekStart));

    const created: PublicationRow[] = [];
    const failed: { bookId: string; error: string; code?: string }[] = [];
    for (const item of items) {
      const book = bookById.get(item.bookId);
      if (!book) { failed.push({ bookId: item.bookId, error: "Book not found" }); continue; }
      if (book.status !== "completed") { failed.push({ bookId: item.bookId, error: "Only finished books can be planned" }); continue; }
      const format = item.format || formatForBook(book.book_type as string);
      if (!slotAvailable(pubs, item.weekStart, format, limit)) {
        failed.push({ bookId: item.bookId, error: `That week's ${format} slots are full (${limit}/${limit}).`, code: "SLOT_FULL" });
        continue;
      }
      const ins = await admin
        .from("publications")
        .insert({ user_id: userId, book_id: item.bookId, format, week_start: item.weekStart })
        .select(PUBLICATION_COLUMNS)
        .single();
      if (ins.error) {
        const dup = ins.error.code === "23505";
        failed.push({ bookId: item.bookId, error: dup ? `Already planned as ${format}` : "Could not plan this book", code: dup ? "ALREADY_PLANNED" : undefined });
        if (!dup) console.error("[planner] insert failed:", ins.error);
        continue;
      }
      const row = ins.data as PublicationRow;
      pubs.push(row);
      created.push(row);
    }

    if (!created.length) {
      const first = failed[0];
      const status = first?.code === "SLOT_FULL" || first?.code === "ALREADY_PLANNED" ? 409 : 400;
      return NextResponse.json({ error: first?.error ?? "Nothing planned", code: first?.code, created, failed }, { status });
    }
    return NextResponse.json({ created, failed }, { status: 201 });
  } catch (e) {
    return serverError("planner create", e);
  }
}
