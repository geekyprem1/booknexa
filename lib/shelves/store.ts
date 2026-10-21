/**
 * Shelf Suite — data access. Every query is scoped by user_id; callers pass the
 * authenticated user's id. Uses the service-role client because shelves/series
 * (like books) are written server-side only.
 */

import { getSupabaseAdminClient } from "../supabase/admin";
import type { CoverStyle } from "../pdf/cover-style";
import { normalizeCoverStyle } from "./core";

export interface ShelfRow {
  id: string;
  user_id: string;
  name: string;
  niche: string | null;
  audience: string | null;
  pen_name: string | null;
  cover_style: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SeriesRow {
  id: string;
  user_id: string;
  shelf_id: string;
  name: string;
  book_type: string;
  base_input: Record<string, unknown>;
  title_pattern: string;
  subthemes: string[];
  next_volume: number;
  created_at: string;
  updated_at: string;
}

export const SHELF_COLUMNS = "id, user_id, name, niche, audience, pen_name, cover_style, created_at, updated_at";
export const SERIES_COLUMNS =
  "id, user_id, shelf_id, name, book_type, base_input, title_pattern, subthemes, next_volume, created_at, updated_at";

export async function getShelf(userId: string, shelfId: string): Promise<ShelfRow | null> {
  if (!isUuid(shelfId)) return null;
  const { data, error } = await getSupabaseAdminClient()
    .from("shelves")
    .select(SHELF_COLUMNS)
    .eq("id", shelfId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ShelfRow | null) ?? null;
}

export async function getSeries(userId: string, seriesId: string): Promise<SeriesRow | null> {
  if (!isUuid(seriesId)) return null;
  const { data, error } = await getSupabaseAdminClient()
    .from("series")
    .select(SERIES_COLUMNS)
    .eq("id", seriesId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as SeriesRow | null) ?? null;
}

/** Cover style for a book on this shelf (colors only; the series adds the badge). */
export function shelfCoverStyle(shelf: Pick<ShelfRow, "cover_style">): CoverStyle {
  return normalizeCoverStyle(shelf.cover_style);
}

/** Take the next (or a given) volume number atomically. */
export async function takeVolume(userId: string, seriesId: string, volume?: number): Promise<number> {
  const { data, error } = await getSupabaseAdminClient().rpc("series_take_volume", {
    p_series: seriesId,
    p_user: userId,
    p_volume: volume ?? null,
  });
  if (error) throw error;
  const n = Number(data);
  if (!Number.isInteger(n) || n < 1) throw new Error("series_take_volume returned no volume");
  return n;
}

/** True if a non-failed book already holds this volume number. */
export async function volumeTaken(seriesId: string, volume: number): Promise<boolean> {
  const { count, error } = await getSupabaseAdminClient()
    .from("books")
    .select("id", { count: "exact", head: true })
    .eq("series_id", seriesId)
    .eq("volume_no", volume)
    .neq("status", "failed");
  if (error) throw error;
  return (count ?? 0) > 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
