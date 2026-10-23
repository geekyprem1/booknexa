import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bookObjectKey, getBytes } from "@/lib/storage";
import { isStudioCoverKey } from "@/lib/books/studio-cover";
import { kindleCoverJpeg } from "@/lib/cover/kindle";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Kindle eBook cover as JPEG — the file KDP asks for next to the manuscript. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`dl-ebook-cover:${user.id}`, 30);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  // RLS scopes the row to its owner.
  const { data: book } = await supabase
    .from("books")
    .select("id, title, book_type, status, cover_key")
    .eq("id", id)
    .maybeSingle();
  if (!book || book.book_type !== "ebook") return NextResponse.json({ error: "Ebook not found" }, { status: 404 });
  if (book.status !== "completed") return NextResponse.json({ error: "Ebook is not ready yet" }, { status: 409 });

  const key = book.cover_key as string | null;
  const owned = key === bookObjectKey(user.id, id, "cover") || isStudioCoverKey(key, user.id);
  if (!key || !owned) return NextResponse.json({ error: "Cover unavailable" }, { status: 404 });

  let jpeg: Uint8Array;
  try {
    jpeg = await kindleCoverJpeg(await getBytes(key));
  } catch (e) {
    console.error("[ebook-cover] convert failed:", e);
    return NextResponse.json({ error: "Could not prepare the cover" }, { status: 500 });
  }
  const slug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "ebook";
  return new NextResponse(Buffer.from(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${slug}-kindle-cover.jpg"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
