import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizePenName, PEN_NAME_MAX } from "@/lib/publishing/pen-name";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save just the Publishing Profile pen name: { penName }. Used by the first-book prompt. */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`pen-name:${user.id}`, 10);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const penName = normalizePenName(body?.penName);
  if (!penName) {
    return NextResponse.json({ error: `Pen name must be 2–${PEN_NAME_MAX} characters.` }, { status: 400 });
  }

  // User-scoped client (RLS "own profile update"), same as /api/settings.
  const { error } = await supabase
    .from("profiles")
    .update({ pen_name: penName, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: "Could not save your pen name" }, { status: 500 });
  return NextResponse.json({ penName });
}
