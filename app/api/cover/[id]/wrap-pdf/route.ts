import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getAccountSession } from "@/lib/supabase/server";
import { getBytes, isCanonicalCoverVariationObjectKey } from "@/lib/storage";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { buildStudioWrapPdf, DEFAULT_WRAP_BG, parseHex } from "@/lib/cover/wrap";
import {
  MIN_PAGE_COUNT,
  type PaperStock,
  type TrimSize,
  TRIM_SIZES,
} from "@/lib/pdf/kdp-specs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "cover";

/** KDP max interior page count for a paperback. */
const MAX_PAGE_COUNT = 828;
const PAPERS: PaperStock[] = ["white", "cream", "color-standard", "color-premium"];

function parsePaper(v: string | null): PaperStock {
  return v && (PAPERS as string[]).includes(v) ? (v as PaperStock) : "white";
}

function parseTrim(v: string | null): TrimSize {
  return v && v in TRIM_SIZES ? (v as TrimSize) : "6x9";
}

/** Clamp page count into the KDP-valid range so the spine math stays sane. */
function parsePages(v: string | null): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 120;
  return Math.min(MAX_PAGE_COUNT, Math.max(MIN_PAGE_COUNT, n));
}

/**
 * Print-ready WRAPAROUND cover PDF (back | spine | front) for KDP paperbacks.
 *
 * The front panel is the generated concept art (which already carries its own
 * title/author). The spine width is computed from the buyer's page count + paper
 * stock, and the back/spine share a chosen solid color so the wrap reads as one
 * cover. The bottom-right of the back panel is left clear for KDP's barcode.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const v = Number(sp.get("v") ?? "0");

  const supabase = await createSupabaseServerClient();
  const account = await getAccountSession(supabase);
  if (account.kind === "unauthenticated") {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (account.kind !== "active") {
    return NextResponse.json({ error: "Account is not active" }, { status: 403 });
  }
  const { user } = account;
  const rl = rateLimit(`dl-coverwrap:${user.id}`, 20);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);

  const { data: cover } = await supabase
    .from("covers")
    .select("title, subtitle, author, trim, variation_keys")
    .eq("id", id)
    .single();
  if (!cover) return NextResponse.json({ error: "Cover not found" }, { status: 404 });

  const keys = (cover.variation_keys as string[]) ?? [];
  const variation = Number.isInteger(v) && v >= 0 ? v : -1;
  if (variation < 0) return NextResponse.json({ error: "Invalid variation" }, { status: 400 });
  const key = keys[variation];
  if (!key || !isCanonicalCoverVariationObjectKey(key, user.id, id, variation)) {
    return NextResponse.json({ error: "Concept not found" }, { status: 404 });
  }

  const pageCount = parsePages(sp.get("pages"));
  const { pdf } = await buildStudioWrapPdf({
    frontPng: await getBytes(key),
    trim: parseTrim((cover.trim as string) ?? "6x9"),
    pageCount,
    paper: parsePaper(sp.get("paper")),
    background: parseHex(sp.get("bg"), DEFAULT_WRAP_BG),
    title: (cover.title as string) ?? "",
    subtitle: (cover.subtitle as string) ?? "",
    author: (cover.author as string) ?? "",
  });
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${slug(cover.title as string)}-wraparound-${pageCount}pp.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
