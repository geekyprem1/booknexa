import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getAccountSession } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireMutationRow } from "@/lib/supabase/errors";
import {
  coverVariationObjectKey,
  deleteBytes,
  getCoverVariationSignedUrl,
  isStorageConfigured,
  putBytes,
} from "@/lib/storage";
import { COVER_GENRES, type CoverGenre } from "@/lib/cover";
import { coverV2Config, coverV2Unavailable } from "@/lib/cover-v2/config";
import { generateConceptSet } from "@/lib/cover-v2/generate";
import { isSelectableModel, modelLabel, modelProvider } from "@/lib/cover-v2/models";
import { isReplicateConfigured } from "@/lib/cover-v2/providers/replicate";
import { resolveStyle, STYLE_PRESETS } from "@/lib/cover-v2/styles";
import { CoverV2SafetyError } from "@/lib/cover-v2/errors";
import { TRIM_SIZES, type TrimSize } from "@/lib/pdf/kdp-specs";
import { costFor, recordUsage, refund, reserve } from "@/lib/billing";
import { assertFeature, billingErrorResponse } from "@/lib/billing/guard";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The three selectable models take 8–13s per cover; with repairs and two concepts a
// set can approach two minutes. flux-2-dev is intentionally not selectable because
// its 235s per cover would not fit any request budget.
export const maxDuration = 300;

// Every KDP trim the app knows (incl. 8x10, which the picker hides but a book
// may already use), so a cover made for an existing book always fits it.
const TRIMS = Object.keys(TRIM_SIZES) as TrimSize[];
const LIMITS = { title: 300, subtitle: 300, author: 200, niche: 200, audience: 300 } as const;

function text(body: Record<string, unknown>, field: keyof typeof LIMITS): string | undefined {
  const value = body[field];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > LIMITS[field]) throw new Error(`${field} is too long`);
  return trimmed || undefined;
}

export async function POST(req: NextRequest) {
  // Beta gate first: an unreleased engine should not even acknowledge requests.
  if (coverV2Unavailable() !== null) {
    return NextResponse.json({ error: "Cover Studio V2 is not available." }, { status: 403 });
  }

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

  const rl = rateLimit(`cover-v2:${user.id}`, 6);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid body");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let fields: { [K in keyof typeof LIMITS]?: string };
  try {
    fields = Object.fromEntries(
      (Object.keys(LIMITS) as Array<keyof typeof LIMITS>).map((f) => [f, text(body, f)])
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid input" }, { status: 400 });
  }
  if (!fields.title) return NextResponse.json({ error: "Book title is required" }, { status: 400 });

  if (body.genre !== undefined && !COVER_GENRES.includes(body.genre as CoverGenre)) {
    return NextResponse.json({ error: "Invalid genre" }, { status: 400 });
  }
  if (body.trim !== undefined && !TRIMS.includes(body.trim as (typeof TRIMS)[number])) {
    return NextResponse.json({ error: "Invalid trim size" }, { status: 400 });
  }
  // The model id becomes part of an upstream URL path, so it must come from the
  // allow-list rather than from the request.
  if (body.model !== undefined && !isSelectableModel(body.model)) {
    return NextResponse.json({ error: "Invalid model" }, { status: 400 });
  }
  // A Replicate-backed model cannot run without a token; reject early rather than
  // reserving credits and failing mid-generation.
  if (isSelectableModel(body.model) && modelProvider(body.model) === "replicate" && !isReplicateConfigured()) {
    return NextResponse.json({ error: "This model is not available." }, { status: 400 });
  }

  const genre = (body.genre ?? "business") as CoverGenre;
  const trim = (body.trim ?? "6x9") as string;
  const style = resolveStyle(body.style);
  const model = isSelectableModel(body.model) ? body.model : coverV2Config().model;
  const hybridOnly = body.hybridOnly === true;

  const input = {
    title: fields.title,
    subtitle: fields.subtitle,
    author: fields.author,
    niche: fields.niche,
    audience: fields.audience,
    genre,
    trim,
    style,
  };

  const cost = costFor("cover_v2");
  try {
    await assertFeature(user.id, "cover_v2");
    await reserve(user.id, cost, "cover_v2");
  } catch (error) {
    const response = billingErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const admin = getSupabaseAdminClient();
  let coverId: string | undefined;
  const uploaded: string[] = [];
  let committed = false;

  try {
    const concepts = await generateConceptSet(input, {
      model,
      maxAttempts: hybridOnly ? 0 : undefined,
    });

    const insert = await admin
      .from("covers")
      .insert({
        user_id: user.id,
        engine: "v2",
        title: input.title,
        subtitle: input.subtitle ?? null,
        author: input.author ?? null,
        book_type: genre,
        genre,
        trim,
        audience: input.audience ?? null,
        image_prompt: concepts[0].prompt.slice(0, 4000),
        layout: STYLE_PRESETS[style].label,
        typography: concepts[0].brief.typographyInstruction,
        model,
        design_brief: concepts[0].brief,
      })
      .select("id")
      .single();
    coverId = (requireMutationRow(insert, "Create cover") as { id: string }).id;

    const keys: string[] = [];
    for (let i = 0; i < concepts.length; i++) {
      const key = coverVariationObjectKey(user.id, coverId, i);
      uploaded.push(key);
      await putBytes(key, concepts[i].png, "image/png");
      keys.push(key);
    }

    // Stored in the same shape V1 uses, so the existing cover library, detail page,
    // downloads and use-for-book routes work on V2 covers unchanged.
    const conceptMeta = concepts.map((c, i) => ({
      index: i,
      layout: STYLE_PRESETS[style].label,
      engine: "v2",
      model: c.imageModel,
      strategy: c.strategy,
      text_source: c.textSource,
      text_verified: c.textVerified,
      verify_attempts: c.attempts.length,
      final_px: c.finalPx,
    }));

    const update = await admin
      .from("covers")
      .update({ variation_keys: keys, concepts: conceptMeta })
      .eq("id", coverId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    requireMutationRow(update, "Commit cover generation", "Cover");
    committed = true;

    try {
      await recordUsage(user.id, "cover_v2", cost, "completed", coverId, { topic: input.title });
    } catch (usageError) {
      console.error("[cover-v2] usage recording failed:", usageError);
    }

    const urls = await Promise.all(
      keys.map((key, index) => getCoverVariationSignedUrl(key, user.id, coverId as string, index, 600))
    );

    return NextResponse.json({
      id: coverId,
      style: STYLE_PRESETS[style].label,
      model,
      modelLabel: modelLabel(model),
      variations: concepts.map((c, i) => ({
        index: i,
        url: urls[i],
        textSource: c.textSource,
        textVerified: c.textVerified,
        attempts: c.attempts.map((a) => ({ strategy: a.strategy, ok: a.ok, reason: a.reason })),
        concept: c.brief.concept,
        typography: c.brief.typographyInstruction,
        finalPx: c.finalPx,
      })),
    });
  } catch (error) {
    if (!committed) {
      if (uploaded.length) {
        try {
          await deleteBytes(uploaded);
        } catch (cleanup) {
          console.error("[cover-v2] storage rollback failed:", cleanup);
        }
      }
      if (coverId) {
        try {
          await admin.from("covers").delete().eq("id", coverId).eq("user_id", user.id);
        } catch (cleanup) {
          console.error("[cover-v2] row rollback failed:", cleanup);
        }
      }
      try {
        await refund(user.id, cost, coverId);
      } catch (refundError) {
        console.error("[cover-v2] credit refund failed:", refundError);
      }
      try {
        await recordUsage(user.id, "cover_v2", cost, "failed", coverId, { topic: input.title });
      } catch {
        /* analytics only */
      }
    }

    if (error instanceof CoverV2SafetyError) {
      return NextResponse.json(
        {
          error:
            "The model's content filter blocked this cover. This usually happens when the title is very close to a well-known published book — try rewording it.",
          code: "content_filtered",
        },
        { status: 422 }
      );
    }
    console.error("[cover-v2] generation failed:", error);
    return NextResponse.json(
      { error: committed ? "Covers were generated, but the download links are temporarily unavailable." : "Cover generation failed. Please try again." },
      { status: 500 }
    );
  }
}
