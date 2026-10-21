import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { putBytes } from "@/lib/storage";
import { costFor, recordUsage, refund, reserve } from "@/lib/billing";
import { assertFeature, billingErrorResponse } from "@/lib/billing/guard";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { isMockupKind, MOCKUP_KINDS, MOCKUP_SPECS, outputSize, unavailableReason, type MockupKind } from "@/lib/mockups/kinds";
import { mockupKey, updateAssets } from "@/lib/mockups/assets";
import { renderMockup } from "@/lib/mockups/render";
import { loadMockupSource } from "@/lib/mockups/source";
import { isUuid } from "@/lib/shelves/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Render the mockup pack for a book: { kinds?: MockupKind[] } (default: all
 * that this book can support). 1 credit per pack, refunded on failure.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`mockups:${user.id}`, 5);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!isUuid(id)) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  let requested: MockupKind[] = MOCKUP_KINDS;
  if (body.kinds !== undefined) {
    if (!Array.isArray(body.kinds) || !body.kinds.length || !body.kinds.every(isMockupKind)) {
      return NextResponse.json({ error: "Unknown mockup kind" }, { status: 400 });
    }
    requested = [...new Set(body.kinds as MockupKind[])];
  }

  try {
    await assertFeature(user.id, "mockups");
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }

  let source;
  try {
    source = await loadMockupSource(user.id, id);
  } catch (e) {
    console.error("[mockups] load failed:", e);
    return NextResponse.json({ error: "Could not load this book's images." }, { status: 500 });
  }
  if (!source) return NextResponse.json({ error: "Book not found" }, { status: 404 });
  if (source.book.status !== "completed") return NextResponse.json({ error: "Book is not ready yet" }, { status: 409 });

  const skipped: { kind: MockupKind; reason: string }[] = [];
  const kinds = requested.filter((k) => {
    const reason = unavailableReason(k, source.availability);
    if (reason) skipped.push({ kind: k, reason });
    return !reason;
  });
  if (!kinds.length) {
    return NextResponse.json(
      {
        error: source.availability.hasCover
          ? "None of these mockups fit this book."
          : "This book has no cover preview yet. Books created from now on get one automatically; regenerate older books to use mockups.",
        skipped,
      },
      { status: 409 }
    );
  }

  const cost = costFor("mockups");
  try {
    await reserve(user.id, cost, "mockups", id);
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const keys: Partial<Record<MockupKind, string>> = {};
    for (const kind of kinds) {
      const png = await renderMockup(kind, source.inputs);
      const key = mockupKey(user.id, id, kind);
      await putBytes(key, png, "image/png");
      keys[kind] = key;
    }
    const mockupsAt = new Date().toISOString();
    await updateAssets(user.id, id, { mockups: { ...(source.assets.mockups ?? {}), ...keys }, mockupsAt });
    await recordUsage(user.id, "mockups", cost, "completed", id, { kinds }).catch((err) =>
      console.error("[mockups] usage record failed:", err)
    );
    return NextResponse.json({
      mockupsAt,
      mockups: kinds.map((k) => ({ kind: k, label: MOCKUP_SPECS[k].label, ...outputSize(k) })),
      skipped,
    });
  } catch (e) {
    console.error("[mockups] render failed:", e);
    await refund(user.id, cost, id);
    await recordUsage(user.id, "mockups", cost, "failed", id).catch(() => {});
    return NextResponse.json({ error: "Could not render mockups. Your credit was refunded." }, { status: 500 });
  }
}
