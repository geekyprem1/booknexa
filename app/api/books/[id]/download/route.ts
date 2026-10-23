import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getAccountSession } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getBookArtifactSignedUrl,
  getCoverVariationSignedUrl,
} from "@/lib/storage";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { CoverNotReadyError, CoverTrimMismatchError, repairPrintCover } from "@/lib/books/studio-cover";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const part = req.nextUrl.searchParams.get("part") === "cover" ? "cover" : "interior";

  const supabase = await createSupabaseServerClient();
  const account = await getAccountSession(supabase);
  if (account.kind === "unauthenticated") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (account.kind !== "active") {
    return NextResponse.json({ error: "Account is not active" }, { status: 403 });
  }
  const { user } = account;
  const rl = rateLimit(`dl-book:${user.id}`, 60);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  // RLS ensures the user can only read their own book.
  const { data: book } = await supabase
    .from("books")
    .select("id, book_type, interior_key, cover_key, status")
    .eq("id", id)
    .single();

  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (book.status !== "completed") {
    return NextResponse.json({ error: "Book is not ready yet" }, { status: 409 });
  }

  let coverKey: string | null = book.cover_key;
  if (part === "cover") {
    // A print book whose cover_key still points at a Studio front PNG gets its
    // wraparound PDF built once here (KDP rejects a front-only paperback cover).
    try {
      coverKey = await repairPrintCover(user.id, book);
    } catch (error) {
      if (error instanceof CoverTrimMismatchError || error instanceof CoverNotReadyError) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      console.error("[download] cover repair failed:", error);
      return NextResponse.json({ error: "Could not build the paperback cover" }, { status: 500 });
    }
  }

  const key = part === "cover" ? coverKey : book.interior_key;
  if (!key) return NextResponse.json({ error: "File unavailable" }, { status: 404 });

  let url: string | null = null;
  try {
    url = await getBookArtifactSignedUrl(key, user.id, id, part, 300);
  } catch {
    if (part === "cover") {
      // A Cover Studio variation can be applied to a book. Validate that
      // fallback against an owned cover row and its exact variation slot.
      const { data: sourceCover } = await supabase
        .from("covers")
        .select("id, variation_keys")
        .contains("variation_keys", [key])
        .maybeSingle();
      const variationKeys = (sourceCover?.variation_keys as string[] | undefined) ?? [];
      const variation = variationKeys.indexOf(key);
      if (sourceCover && variation >= 0) {
        try {
          url = await getCoverVariationSignedUrl(
            key,
            user.id,
            sourceCover.id,
            variation,
            300
          );
        } catch {
          // The stored key did not match the owned cover's canonical slot.
        }
      }
    }
  }
  if (!url) return NextResponse.json({ error: "File unavailable" }, { status: 404 });

  // Record the download (service role — RLS blocks client writes).
  await getSupabaseAdminClient()
    .from("downloads")
    .insert({ user_id: user.id, book_id: id, part });

  return NextResponse.redirect(url);
}
