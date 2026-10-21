import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getShelf, isUuid } from "@/lib/shelves/store";
import { badRequest, jsonBody, notFound, serverError, shelfRouteUser } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 50;

const idList = (raw: unknown): string[] | null => {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_IDS || !raw.every(isUuid)) return null;
  return [...new Set(raw as string[])];
};

/**
 * Move existing books onto / off this shelf: { add?: uuid[], remove?: uuid[] }.
 * Adding a book that belongs to another shelf's series detaches it from that series.
 * Removing a book also detaches it from any series on this shelf.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await shelfRouteUser("shelves-write", 30);
  if (user instanceof Response) return user;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const add = idList(body.add);
  const remove = idList(body.remove);
  if (!add || !remove) return badRequest(`add/remove must be lists of up to ${MAX_IDS} book ids`);
  if (!add.length && !remove.length) return badRequest("Nothing to change");

  try {
    const shelf = await getShelf(user.id, id);
    if (!shelf) return notFound("Shelf");
    const admin = getSupabaseAdminClient();

    let added = 0;
    if (add.length) {
      // Same-shelf books keep their series; books from elsewhere arrive as one-offs.
      const moved = await admin
        .from("books")
        .update({ shelf_id: id, series_id: null, volume_no: null })
        .in("id", add)
        .eq("user_id", user.id)
        .or(`shelf_id.is.null,shelf_id.neq.${id}`)
        .select("id");
      if (moved.error) throw moved.error;
      added = moved.data?.length ?? 0;
    }

    let removed = 0;
    if (remove.length) {
      const res = await admin
        .from("books")
        .update({ shelf_id: null, series_id: null, volume_no: null })
        .in("id", remove)
        .eq("user_id", user.id)
        .eq("shelf_id", id)
        .select("id");
      if (res.error) throw res.error;
      removed = res.data?.length ?? 0;
    }

    return NextResponse.json({ added, removed });
  } catch (e) {
    return serverError("shelf books", e);
  }
}
