import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeCoverStyle, optionalText } from "@/lib/shelves/core";
import { SHELF_COLUMNS } from "@/lib/shelves/store";
import { badRequest, jsonBody, serverError, shelfRouteUser } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SHELVES = 200;

/** List the user's shelves with book + series counts. */
export async function GET() {
  const user = await shelfRouteUser("shelves-read", 60);
  if (user instanceof Response) return user;

  const { data, error } = await getSupabaseAdminClient()
    .from("shelves")
    .select(`${SHELF_COLUMNS}, books(count), series(count)`)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_SHELVES);
  if (error) return serverError("list shelves", error);
  return NextResponse.json({ shelves: data ?? [] });
}

/** Create a shelf: { name, niche?, audience?, penName?, coverStyle? }. */
export async function POST(req: NextRequest) {
  const user = await shelfRouteUser("shelves-write", 20);
  if (user instanceof Response) return user;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const name = optionalText(body.name, 120);
  if (!name) return badRequest("Shelf name is required");

  const admin = getSupabaseAdminClient();
  const { count } = await admin.from("shelves").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= MAX_SHELVES) return badRequest(`You can have up to ${MAX_SHELVES} shelves.`);

  const { data, error } = await admin
    .from("shelves")
    .insert({
      user_id: user.id,
      name,
      niche: optionalText(body.niche, 200) ?? null,
      audience: optionalText(body.audience, 200) ?? null,
      pen_name: optionalText(body.penName, 120) ?? null,
      cover_style: normalizeCoverStyle(body.coverStyle),
      opportunity: body.opportunity && typeof body.opportunity === "object" ? body.opportunity : null,
    })
    .select(SHELF_COLUMNS)
    .single();
  if (error || !data) return serverError("create shelf", error);
  return NextResponse.json({ shelf: data }, { status: 201 });
}
