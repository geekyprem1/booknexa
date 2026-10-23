import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateJson } from "@/lib/ai/provider";
import { isAiConfigured } from "@/lib/ai/models";
import { recordUsage, refund, reserve } from "@/lib/billing";
import { billingErrorResponse } from "@/lib/billing/guard";
import { BOOK_TYPE_LABEL } from "@/lib/books/request";
import type { PipelineBookType } from "@/lib/books/pipeline";
import { normalizeSubthemes } from "@/lib/shelves/core";
import { getSeries, getShelf, SERIES_COLUMNS } from "@/lib/shelves/store";
import { badRequest, notFound, serverError, shelfRouteUser } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COST = 1;

/**
 * AI-suggest 10 subthemes for a themed series and save them (replacing the list).
 * One subtheme per volume keeps word lists fresh across volumes. 1 credit.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await shelfRouteUser("series-subthemes", 5);
  if (user instanceof Response) return user;
  if (!isAiConfigured()) return NextResponse.json({ error: "AI is not configured." }, { status: 503 });

  let series, shelf;
  try {
    series = await getSeries(user.id, id);
    if (!series) return notFound("Series");
    shelf = await getShelf(user.id, series.shelf_id);
  } catch (e) {
    return serverError("load series", e);
  }
  const theme = typeof series.base_input?.theme === "string" ? series.base_input.theme : "";
  if (!theme) return badRequest("Subthemes only apply to themed series (ebook, word search, coloring, scramble, crossword, activity).");

  try {
    await reserve(user.id, COST, "series_subthemes", series.id);
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }

  try {
    const typeLabel = BOOK_TYPE_LABEL[series.book_type as PipelineBookType] ?? series.book_type;
    const isEbook = series.book_type === "ebook";
    const ebookAudience = typeof series.base_input?.audience === "string" ? series.base_input.audience : "";
    const audience = shelf?.audience || (isEbook ? ebookAudience : "");
    const { data: subthemes } = await generateJson<string[]>({
      system: isEbook
        ? "You plan Amazon KDP non-fiction ebook series. Reply with JSON only."
        : "You plan Amazon KDP low-content book series. Reply with JSON only.",
      prompt: isEbook
        ? `A non-fiction ebook series covers the topic "${theme}"${audience ? ` for ${audience}` : ""}.
Suggest 10 distinct subtopics, one per volume, so each volume is a different book that doesn't repeat the others.
Each subtopic: 2–6 words, specific enough to fill a short ebook, clearly inside the main topic, no numbering.
Return a JSON array of 10 strings.`
        : `A ${typeLabel} series has the theme "${theme}"${audience ? ` for ${audience}` : ""}.
Suggest 10 distinct subthemes, one per volume, so each volume gets a different word list or set of pages.
Each subtheme: 1–4 words, concrete, family-friendly, clearly inside the main theme, no numbering.
Return a JSON array of 10 strings.`,
      temperature: 0.8,
      maxTokens: 400,
      validate: (raw) => {
        const list = normalizeSubthemes(Array.isArray(raw) ? raw : (raw as { subthemes?: unknown })?.subthemes);
        if (list.length < 5) throw new Error("too few subthemes");
        return list.slice(0, 10);
      },
    });

    const { data, error } = await getSupabaseAdminClient()
      .from("series")
      .update({ subthemes, updated_at: new Date().toISOString() })
      .eq("id", series.id)
      .eq("user_id", user.id)
      .select(SERIES_COLUMNS)
      .maybeSingle();
    if (error || !data) throw error ?? new Error("series vanished");

    await recordUsage(user.id, "series_subthemes", COST, "completed", series.id, { topic: theme }).catch((err) =>
      console.error("[shelves] usage record failed:", err)
    );
    return NextResponse.json({ series: data });
  } catch (e) {
    await refund(user.id, COST, series.id);
    await recordUsage(user.id, "series_subthemes", COST, "failed", series.id, { topic: theme }).catch(() => {});
    return serverError("subthemes", e);
  }
}
