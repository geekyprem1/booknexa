import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBytes } from "@/lib/storage";
import { buildPackageZip, type PackageAsset, type PackageData, type PublishContext } from "@/lib/publishing";
import { buildEbookPdf } from "@/lib/export/pdf";
import { buildEpub } from "@/lib/export/epub";
import { kindleCoverJpeg } from "@/lib/cover/kindle";
import { CoverNotReadyError, CoverTrimMismatchError, repairPrintCover } from "@/lib/books/studio-cover";
import { TRIM_SIZES, type TrimSize } from "@/lib/pdf/kdp-specs";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { MOCKUP_KINDS } from "@/lib/mockups/kinds";
import { isOwnAssetKey, readAssets } from "@/lib/mockups/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50) || "book";

/** Gather interior + cover bytes for any book type. */
async function bookAssets(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  book: { id: string; title: string; book_type: string; trim_size?: string | null; interior_key: string | null; cover_key: string | null; config: unknown }
): Promise<PackageAsset[]> {
  const assets: PackageAsset[] = [];

  if (book.book_type === "ebook") {
    // interior is built on demand from stored chapters
    const [{ data: chapters }, { data: metaRow }] = await Promise.all([
      supabase.from("ebook_chapters").select("idx, title, content_md").eq("book_id", book.id).order("idx", { ascending: true }),
      supabase.from("books").select("book_metadata(subtitle)").eq("id", book.id).single(),
    ]);
    const cfg = (book.config ?? {}) as { author?: string };
    const subtitle = ((metaRow?.book_metadata as unknown as { subtitle: string | null }[] | null)?.[0]?.subtitle) ?? undefined;
    // The interior PDF must match the trim the package declares in its metadata.
    const trimRaw = book.trim_size ?? "6x9";
    const trim = (trimRaw in TRIM_SIZES ? trimRaw : "6x9") as TrimSize;
    const ebookData = {
      title: book.title,
      subtitle,
      author: cfg.author ?? "BookNexa",
      chapters: (chapters ?? []).map((c) => ({ idx: c.idx, title: c.title, contentMd: c.content_md })),
    };
    // Kindle manuscript: EPUB is KDP's recommended eBook format. The PDF stays
    // for a print edition.
    assets.push({ name: "manuscript.epub", bytes: await buildEpub(ebookData) });
    assets.push({ name: "interior.pdf", bytes: await buildEbookPdf(ebookData, { trim }) });
    // Kindle cover: KDP takes JPEG or TIFF, not PNG.
    if (book.cover_key) assets.push({ name: "cover.jpg", bytes: await kindleCoverJpeg(await getBytes(book.cover_key)) });
    return assets;
  }

  if (book.interior_key) assets.push({ name: "interior.pdf", bytes: await getBytes(book.interior_key) });
  // Print books must ship a wraparound PDF; convert a legacy Studio PNG first.
  const coverKey = await repairPrintCover(userId, book);
  if (coverKey) assets.push({ name: "cover.pdf", bytes: await getBytes(coverKey) });
  return assets;
}

/** Rendered mockups go into the ZIP under mockups/. Missing column or files are skipped. */
async function mockupAssets(userId: string, bookId: string): Promise<PackageAsset[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("books")
    .select("assets")
    .eq("id", bookId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return [];
  const mockups = readAssets(data.assets).mockups ?? {};
  const out: PackageAsset[] = [];
  for (const kind of MOCKUP_KINDS) {
    const key = mockups[kind];
    if (!isOwnAssetKey(key, userId, bookId)) continue;
    try {
      out.push({ name: `mockups/${kind}.png`, bytes: await getBytes(key) });
    } catch {
      /* a missing file shouldn't break the Launch Kit */
    }
  }
  return out;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`dl-package:${user.id}`, 20);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  // RLS scopes the package to the owner.
  const { data: pkg } = await supabase
    .from("book_publish_packages")
    .select("id, book_id, metadata_json, keywords, description, categories, alternative_titles")
    .eq("id", id)
    .single();
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });

  const { data: book } = await supabase
    .from("books")
    .select("id, title, book_type, trim_size, page_count, interior_key, cover_key, config")
    .eq("id", pkg.book_id)
    .single();
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  const md = (pkg.metadata_json ?? {}) as { author?: string };
  const ctx: PublishContext = {
    title: book.title,
    author: md.author ?? "BookNexa",
    bookType: book.book_type,
    trim: book.trim_size ?? "8.5x11",
    pageCount: book.page_count ?? undefined,
  };
  const data: PackageData = {
    metadataJson: pkg.metadata_json as PackageData["metadataJson"],
    keywords: (pkg.keywords as PackageData["keywords"]) ?? { primary: [], longTail: [] },
    description: pkg.description ?? "",
    categories: (pkg.categories as string[]) ?? [],
    alternativeTitles: (pkg.alternative_titles as string[]) ?? [],
  };

  let assets: PackageAsset[];
  try {
    assets = await bookAssets(supabase, user.id, book);
  } catch (error) {
    if (error instanceof CoverTrimMismatchError || error instanceof CoverNotReadyError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
  assets.push(...(await mockupAssets(user.id, book.id)));
  const zip = await buildPackageZip({ ctx, data, assets });

  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${slug(book.title)}-publish-package.zip"`,
      // Short browser cache to avoid re-running the build on repeat downloads;
      // kept brief since the ebook interior is rebuilt from editable chapters.
      "Cache-Control": "private, max-age=60",
    },
  });
}
