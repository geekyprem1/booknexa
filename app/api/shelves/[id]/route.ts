import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeCoverStyle, optionalText } from "@/lib/shelves/core";
import { getShelf, SERIES_COLUMNS, SHELF_COLUMNS } from "@/lib/shelves/store";
import { badRequest, jsonBody, notFound, serverError, shelfRouteUser } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Shelf + its series + its books. */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await shelfRouteUser("shelves-read", 60);
  if (user instanceof Response) return user;

  try {
    const shelf = await getShelf(user.id, id);
    if (!shelf) return notFound("Shelf");
    const admin = getSupabaseAdminClient();
    const [series, books] = await Promise.all([
      admin.from("series").select(SERIES_COLUMNS).eq("shelf_id", id).eq("user_id", user.id).order("created_at"),
      admin
        .from("books")
        .select("id, title, book_type, status, page_count, series_id, volume_no, created_at")
        .eq("shelf_id", id)
        .eq("user_id", user.id)
        .order("created_at"),
    ]);
    if (series.error) throw series.error;
    if (books.error) throw books.error;
    return NextResponse.json({ shelf, series: series.data ?? [], books: books.data ?? [] });
  } catch (e) {
    return serverError("get shelf", e);
  }
}

/** Edit name / niche / audience / pen name / cover colors. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await shelfRouteUser("shelves-write", 30);
  if (user instanceof Response) return user;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = optionalText(body.name, 120);
    if (!name) return badRequest("Shelf name can't be empty");
    patch.name = name;
  }
  const niche = optionalText(body.niche, 200);
  if (niche !== undefined) patch.niche = niche;
  const audience = optionalText(body.audience, 200);
  if (audience !== undefined) patch.audience = audience;
  const penName = optionalText(body.penName, 120);
  if (penName !== undefined) patch.pen_name = penName;
  if (body.coverStyle !== undefined) patch.cover_style = normalizeCoverStyle(body.coverStyle);
  if (!Object.keys(patch).length) return badRequest("Nothing to update");
  patch.updated_at = new Date().toISOString();

  const { data, error } = await getSupabaseAdminClient()
    .from("shelves")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SHELF_COLUMNS)
    .maybeSingle();
  if (error) return serverError("update shelf", error);
  if (!data) return notFound("Shelf");
  return NextResponse.json({ shelf: data });
}

/** Delete a shelf and its series. Books are kept; they just leave the shelf. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await shelfRouteUser("shelves-write", 30);
  if (user instanceof Response) return user;

  try {
    const shelf = await getShelf(user.id, id);
    if (!shelf) return notFound("Shelf");
    const admin = getSupabaseAdminClient();
    // Clear the links explicitly (FKs would null shelf_id/series_id but not volume_no).
    const unlink = await admin
      .from("books")
      .update({ shelf_id: null, series_id: null, volume_no: null })
      .eq("shelf_id", id)
      .eq("user_id", user.id);
    if (unlink.error) throw unlink.error;
    const del = await admin.from("shelves").delete().eq("id", id).eq("user_id", user.id);
    if (del.error) throw del.error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError("delete shelf", e);
  }
}
