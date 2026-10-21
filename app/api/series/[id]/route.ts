import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidTitlePattern, normalizeSubthemes, optionalText } from "@/lib/shelves/core";
import { getSeries, SERIES_COLUMNS } from "@/lib/shelves/store";
import { badRequest, jsonBody, notFound, serverError, shelfRouteUser } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Edit name / title pattern / subthemes. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await shelfRouteUser("series-write", 30);
  if (user instanceof Response) return user;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = optionalText(body.name, 160);
    if (!name) return badRequest("Series name can't be empty");
    patch.name = name;
  }
  if (body.titlePattern !== undefined) {
    if (!isValidTitlePattern(body.titlePattern)) return badRequest("Title pattern must include {n}");
    patch.title_pattern = body.titlePattern.trim();
  }
  if (body.subthemes !== undefined) {
    if (!Array.isArray(body.subthemes)) return badRequest("subthemes must be a list");
    patch.subthemes = normalizeSubthemes(body.subthemes);
  }
  if (!Object.keys(patch).length) return badRequest("Nothing to update");
  patch.updated_at = new Date().toISOString();

  const { data, error } = await getSupabaseAdminClient()
    .from("series")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select(SERIES_COLUMNS)
    .maybeSingle();
  if (error) return serverError("update series", error);
  if (!data) return notFound("Series");
  return NextResponse.json({ series: data });
}

/** Delete a series. Its books stay on the shelf as one-offs. */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const user = await shelfRouteUser("series-write", 30);
  if (user instanceof Response) return user;

  try {
    const series = await getSeries(user.id, id);
    if (!series) return notFound("Series");
    const admin = getSupabaseAdminClient();
    const unlink = await admin
      .from("books")
      .update({ series_id: null, volume_no: null })
      .eq("series_id", id)
      .eq("user_id", user.id);
    if (unlink.error) throw unlink.error;
    const del = await admin.from("series").delete().eq("id", id).eq("user_id", user.id);
    if (del.error) throw del.error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverError("delete series", e);
  }
}
