import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildEbookPdf } from "@/lib/export/pdf";
import { buildEpub } from "@/lib/export/epub";
import { buildDocx } from "@/lib/export/docx";
import type { EbookData } from "@/lib/generators/ebook/types";
import { TRIM_SIZES, type TrimSize } from "@/lib/pdf/kdp-specs";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const FORMATS = {
  pdf: { mime: "application/pdf", ext: "pdf" },
  epub: { mime: "application/epub+zip", ext: "epub" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
} as const;

type Format = keyof typeof FORMATS;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") as Format | null;
  if (!format || !FORMATS[format]) {
    return NextResponse.json({ error: "format must be pdf|epub|docx" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`export-ebook:${user.id}`, 20);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const { data: book } = await supabase
    .from("books")
    .select("id, title, config, book_type, trim_size, book_metadata(subtitle)")
    .eq("id", id)
    .single();
  if (!book || book.book_type !== "ebook") {
    return NextResponse.json({ error: "Ebook not found" }, { status: 404 });
  }
  const { data: chapters } = await supabase
    .from("ebook_chapters")
    .select("idx, title, content_md")
    .eq("book_id", id)
    .order("idx", { ascending: true });

  const metaArr = book.book_metadata as unknown as { subtitle: string | null }[] | null;
  const meta = metaArr?.[0] ?? null;
  const cfg = (book.config ?? {}) as { author?: string };
  const data: EbookData = {
    title: book.title,
    subtitle: meta?.subtitle ?? undefined,
    author: cfg.author ?? "BookNexa",
    chapters: (chapters ?? []).map((c) => ({ idx: c.idx, title: c.title, contentMd: c.content_md })),
  };

  // The PDF must honor the trim the book declares (and KDP expects), not a
  // hardcoded 6×9.
  const trimRaw = (book as { trim_size?: string | null }).trim_size ?? "6x9";
  const trim = (trimRaw in TRIM_SIZES ? trimRaw : "6x9") as TrimSize;

  let bytes: Uint8Array;
  if (format === "pdf") bytes = await buildEbookPdf(data, { trim });
  else if (format === "epub") bytes = await buildEpub(data);
  else bytes = await buildDocx(data);

  const slug = book.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "ebook";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": FORMATS[format].mime,
      "Content-Disposition": `attachment; filename="${slug}.${FORMATS[format].ext}"`,
      // Short browser cache so repeat downloads don't re-run the build; kept brief
      // because ebook chapters are editable.
      "Cache-Control": "private, max-age=60",
    },
  });
}
