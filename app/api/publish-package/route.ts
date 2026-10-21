import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { generatePackageData, loadPublishingProfile, profileAuthor, profileCopyright, type PublishContext } from "@/lib/publishing";
import { reserve, refund, recordUsage } from "@/lib/billing";
import { assertFeature, billingErrorResponse } from "@/lib/billing/guard";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`publish:${user.id}`, 10);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const bookId = typeof body.bookId === "string" ? body.bookId : "";
  if (!bookId) return NextResponse.json({ error: "bookId is required" }, { status: 400 });

  // RLS scopes the book to the owner.
  const { data: book } = await supabase
    .from("books")
    .select("id, title, theme, book_type, trim_size, difficulty, page_count, config, opportunity, series_id, volume_no, book_metadata(subtitle, description, keywords)")
    .eq("id", bookId)
    .single();
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  // Series volume → KDP "Series" field in metadata.json + checklist.
  let series: PublishContext["series"] = null;
  if (book.series_id && book.volume_no) {
    const { data: s } = await supabase.from("series").select("name").eq("id", book.series_id).maybeSingle();
    if (s?.name) series = { name: s.name as string, number: book.volume_no as number };
  }

  const metaArr = book.book_metadata as unknown as { subtitle: string | null; description: string | null; keywords: string[] | null }[] | null;
  const meta = metaArr?.[0] ?? null;
  const cfg = (book.config ?? {}) as { author?: string; audience?: string; ageGroup?: string };
  const opp = (book.opportunity ?? null) as { opportunity?: number } | null;
  const profile = await loadPublishingProfile(user.id);

  const ctx: PublishContext = {
    title: book.title,
    subtitle: meta?.subtitle ?? undefined,
    // author baked into the book wins; otherwise fall back to the profile
    author: cfg.author || profileAuthor(profile),
    bookType: book.book_type,
    trim: book.trim_size ?? "8.5x11",
    theme: book.theme,
    difficulty: book.difficulty,
    audience: cfg.audience ?? cfg.ageGroup ?? undefined,
    pageCount: book.page_count ?? undefined,
    opportunityScore: opp?.opportunity ?? null,
    existingDescription: meta?.description ?? undefined,
    existingKeywords: meta?.keywords ?? undefined,
    bleed: book.book_type === "coloring",
    // inherited from the Publishing Profile
    publisher: profile.publisherName,
    language: profile.language,
    copyright: profileCopyright(profile),
    aiDisclosure: profile.aiDisclosure,
    priceOverride: profile.defaultPrice,
    series,
  };

  // Launch Kit™ is an AI-backed generation (keywords + categories + titles +
  // description via OpenRouter), so it is feature-gated and metered like the other
  // generators. Credits are refunded if generation fails.
  const cost = 1;
  try {
    await assertFeature(user.id, "launch_kit");
    await reserve(user.id, cost, "publish", bookId);
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const data = await generatePackageData(ctx);
    const { data: pkg, error } = await getSupabaseAdminClient()
      .from("book_publish_packages")
      .upsert(
        {
          book_id: bookId,
          user_id: user.id,
          metadata_json: data.metadataJson,
          keywords: data.keywords,
          description: data.description,
          categories: data.categories,
          alternative_titles: data.alternativeTitles,
        },
        { onConflict: "book_id" }
      )
      .select("id")
      .single();
    if (error || !pkg) throw new Error(error?.message ?? "save failed");

    await recordUsage(user.id, "launch_kit", cost, "completed", pkg.id, { topic: ctx.title });
    return NextResponse.json({
      id: pkg.id,
      keywordCount: data.keywords.primary.length + data.keywords.longTail.length,
      categoryCount: data.categories.length,
      titleCount: data.alternativeTitles.length,
    });
  } catch (err) {
    await refund(user.id, cost, bookId);
    await recordUsage(user.id, "launch_kit", cost, "failed", undefined, { topic: ctx.title });
    console.error("publish package failed:", err);
    return NextResponse.json({ error: "Could not generate package. Please try again." }, { status: 500 });
  }
}
