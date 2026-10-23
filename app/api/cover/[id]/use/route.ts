import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getAccountSession } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireMutationRow } from "@/lib/supabase/errors";
import { getBytes, isCanonicalCoverVariationObjectKey } from "@/lib/storage";
import { applyStudioCoverToPrintBook, CoverNotReadyError, CoverTrimMismatchError } from "@/lib/books/studio-cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Apply a generated cover variation to one of the user's existing books. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Invalid cover id" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const account = await getAccountSession(supabase);
  if (account.kind === "unauthenticated") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (account.kind === "unavailable") {
    return NextResponse.json({ error: "Account status is unavailable" }, { status: 503 });
  }
  if (account.kind !== "active") {
    return NextResponse.json({ error: "Account is not active" }, { status: 403 });
  }
  const { user } = account;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bookId = typeof body.bookId === "string" ? body.bookId.trim() : "";
  if (!UUID.test(bookId)) return NextResponse.json({ error: "Invalid bookId" }, { status: 400 });
  if (typeof body.variation !== "number" || !Number.isInteger(body.variation) || body.variation < 0) {
    return NextResponse.json({ error: "Invalid variation index" }, { status: 400 });
  }
  const variation = body.variation;

  const [coverResult, bookResult] = await Promise.all([
    supabase.from("covers").select("id, variation_keys").eq("id", id).maybeSingle(),
    supabase.from("books").select("id, book_type").eq("id", bookId).maybeSingle(),
  ]);
  if (coverResult.error || bookResult.error) {
    console.error("[cover-use] ownership lookup failed:", coverResult.error ?? bookResult.error);
    return NextResponse.json({ error: "Could not verify cover ownership" }, { status: 500 });
  }
  if (!coverResult.data) return NextResponse.json({ error: "Cover not found" }, { status: 404 });
  if (!bookResult.data) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const keys = Array.isArray(coverResult.data.variation_keys)
    ? coverResult.data.variation_keys as string[]
    : [];
  const key = keys[variation];
  if (
    typeof key !== "string" ||
    !isCanonicalCoverVariationObjectKey(key, user.id, id, variation)
  ) {
    return NextResponse.json({ error: "Cover variation not found" }, { status: 404 });
  }

  // Print books: KDP needs a wraparound PDF, not the front image. Build it now.
  if (bookResult.data.book_type !== "ebook") {
    try {
      await applyStudioCoverToPrintBook(user.id, bookId, await getBytes(key));
      return NextResponse.json({ ok: true, wrap: true });
    } catch (error) {
      if (error instanceof CoverTrimMismatchError || error instanceof CoverNotReadyError) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      console.error("[cover-use] wrap build failed:", error);
      return NextResponse.json({ error: "Could not build the paperback cover" }, { status: 500 });
    }
  }

  // Ebooks: KDP takes the front image as-is.
  try {
    const updateResult = await getSupabaseAdminClient()
      .from("books")
      .update({ cover_key: key, updated_at: new Date().toISOString() })
      .eq("id", bookId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    requireMutationRow(updateResult, "Apply cover", "Book");
  } catch (error) {
    console.error("[cover-use] update failed:", error);
    return NextResponse.json({ error: "Could not apply cover" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
