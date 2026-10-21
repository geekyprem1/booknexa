import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBytes } from "@/lib/storage";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { isMockupKind, MOCKUP_KINDS } from "@/lib/mockups/kinds";
import { isOwnAssetKey, readAssets } from "@/lib/mockups/assets";
import { isUuid } from "@/lib/shelves/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 50) || "book";

/**
 * Serve one mockup PNG (`/mockups/paperback_3d`), or every mockup as a ZIP
 * (`/mockups/zip`). Add ?download=1 to save instead of display.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`mockup-dl:${user.id}`, 120);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!isUuid(id) || (kind !== "zip" && !isMockupKind(kind))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: book } = await getSupabaseAdminClient()
    .from("books")
    .select("id, title, assets")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const mockups = readAssets(book.assets).mockups ?? {};
  const name = slug(book.title as string);

  try {
    if (kind === "zip") {
      const zip = new JSZip();
      let n = 0;
      for (const k of MOCKUP_KINDS) {
        const key = mockups[k];
        if (!isOwnAssetKey(key, user.id, id)) continue;
        zip.file(`${name}-${k}.png`, await getBytes(key));
        n++;
      }
      if (!n) return NextResponse.json({ error: "No mockups yet" }, { status: 404 });
      const bytes = await zip.generateAsync({ type: "uint8array" });
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${name}-mockups.zip"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const key = mockups[kind as keyof typeof mockups];
    if (!isOwnAssetKey(key, user.id, id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const bytes = await getBytes(key);
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}-${kind}.png"`,
        // The URL carries ?v=<mockupsAt>, so a re-render busts this cache.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("[mockups] serve failed:", e);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
