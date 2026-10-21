/**
 * Weekly Slot Planner — data access. Every query is scoped by user_id; writes use
 * the service-role client (publications are written server-side only).
 */

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase/server";
import { rateLimit, rateLimitResponse } from "../util/rate-limit";
import {
  clampSlotLimit,
  formatForBook,
  holdsSlot,
  slotsUsed,
  type BacklogBook,
  type PubFormat,
  type PublicationLike,
} from "./core";

export const PUBLICATION_COLUMNS = "id, book_id, format, week_start, status, published_at, asin, notes, created_at, updated_at";

export interface PublicationRow extends PublicationLike {
  published_at: string | null;
  asin: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Auth + rate limit for planner routes. Returns the user id or a response. */
export async function plannerUser(key: string, limit = 30): Promise<string | Response> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`${key}:${user.id}`, limit);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  return user.id;
}

export async function getSlotLimit(userId: string): Promise<number> {
  const { data, error } = await getSupabaseAdminClient()
    .from("profiles")
    .select("weekly_slot_limit")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return clampSlotLimit(data?.weekly_slot_limit);
}

export async function setSlotLimit(userId: string, limit: number): Promise<number> {
  const value = clampSlotLimit(limit);
  const { error } = await getSupabaseAdminClient()
    .from("profiles")
    .update({ weekly_slot_limit: value, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
  return value;
}

/** Publications in [fromWeek, toWeek] inclusive. */
export async function publicationsBetween(userId: string, fromWeek: string, toWeek: string): Promise<PublicationRow[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("publications")
    .select(PUBLICATION_COLUMNS)
    .eq("user_id", userId)
    .gte("week_start", fromWeek)
    .lte("week_start", toWeek)
    .order("week_start")
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as PublicationRow[];
}

/** Publications for specific weeks only (for limit checks). */
export async function publicationsForWeeks(userId: string, weeks: string[]): Promise<PublicationRow[]> {
  if (!weeks.length) return [];
  const { data, error } = await getSupabaseAdminClient()
    .from("publications")
    .select(PUBLICATION_COLUMNS)
    .eq("user_id", userId)
    .in("week_start", [...new Set(weeks)]);
  if (error) throw error;
  return (data ?? []) as PublicationRow[];
}

export interface BacklogRow extends BacklogBook {
  title: string;
  page_count: number | null;
}

/** Finished books with no publication yet in their default format (newest 200). */
export async function loadBacklog(userId: string): Promise<BacklogRow[]> {
  const admin = getSupabaseAdminClient();
  const [books, pubs] = await Promise.all([
    admin
      .from("books")
      .select("id, title, book_type, page_count, created_at, shelf_id, series_id, volume_no")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("publications").select("book_id, format").eq("user_id", userId),
  ]);
  if (books.error) throw books.error;
  if (pubs.error) throw pubs.error;
  const taken = new Set((pubs.data ?? []).map((p) => `${p.book_id}|${p.format}`));
  return ((books.data ?? []) as BacklogRow[]).filter((b) => !taken.has(`${b.id}|${formatForBook(b.book_type)}`));
}

/** Full slot check used by create/move/un-skip. */
export function slotAvailable(
  pubs: PublicationLike[],
  weekStart: string,
  format: PubFormat,
  limit: number,
  ignoreId?: string
): boolean {
  return slotsUsed(pubs, weekStart, format, ignoreId) < limit;
}

export { holdsSlot };
