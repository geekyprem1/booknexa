import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isStorageConfigured } from "@/lib/storage";
import { analyzeTopic, type TopicAnalysis } from "@/lib/ai";
import { generateAndStoreBook, type PipelineBookType } from "@/lib/books/pipeline";
import { costFor, reserve, refund, recordUsage } from "@/lib/billing";
import { assertFeature, billingErrorResponse } from "@/lib/billing/guard";
import {
  GenerationInputError,
  normalizeBundleTypes,
  normalizeFiniteInteger,
  PUZZLE_BOOK_TYPES,
} from "@/lib/generation-input";
import { ALL_BOOK_TYPES, type BookType, type OpportunityBand } from "@/lib/opportunity";
import { rateLimit, rateLimitResponse } from "@/lib/util/rate-limit";
import { penNameGate } from "@/lib/publishing/pen-name";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Bundles are puzzle/coloring books only; lowcontent is not a bundle component.
const DEFAULT_COUNT: Partial<Record<PipelineBookType, number>> = { word_search: 25, sudoku: 30, maze: 30, coloring: 24 };
const OPPORTUNITY_BANDS: OpportunityBand[] = ["Low", "Medium", "High", "Excellent"];
const isScore = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= 100;

function reusableAnalysis(value: unknown, selected: PipelineBookType[]): TopicAnalysis {
  const fallback: TopicAnalysis = {
    factors: { demand: 50, competition: 50, evergreen: 50, monetization: 50 },
    opportunity: 50,
    band: "Medium",
    summary: "Using the explicitly selected book types.",
    types: selected.map((type) => ({ type, fit: 50, why: "Selected by the user." })),
    model: "explicit-selection",
  };
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  if (!raw.factors || typeof raw.factors !== "object" || !Array.isArray(raw.types)) return fallback;
  const factors = raw.factors as Record<string, unknown>;
  if (![factors.demand, factors.competition, factors.evergreen, factors.monetization, raw.opportunity].every(isScore)) return fallback;
  if (typeof raw.band !== "string" || !OPPORTUNITY_BANDS.includes(raw.band as OpportunityBand)) return fallback;

  const seen = new Set<BookType>();
  const types: TopicAnalysis["types"] = [];
  for (const item of raw.types) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.type !== "string" || !ALL_BOOK_TYPES.includes(candidate.type as BookType) || seen.has(candidate.type as BookType)) continue;
    if (!isScore(candidate.fit) || typeof candidate.why !== "string") continue;
    const type = candidate.type as BookType;
    seen.add(type);
    types.push({ type, fit: candidate.fit, why: candidate.why.trim().slice(0, 120) });
  }
  if (!selected.every((type) => seen.has(type))) return fallback;
  return {
    factors: {
      demand: factors.demand as number,
      competition: factors.competition as number,
      evergreen: factors.evergreen as number,
      monetization: factors.monetization as number,
    },
    opportunity: raw.opportunity as number,
    band: raw.band as OpportunityBand,
    summary: typeof raw.summary === "string" ? raw.summary.trim().slice(0, 200) : "",
    types,
    model: typeof raw.model === "string" ? raw.model.slice(0, 100) : "reused",
  };
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`bundle:${user.id}`, 4);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  if (!isStorageConfigured()) return NextResponse.json({ error: "Storage is not configured." }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) return NextResponse.json({ error: "Topic is required" }, { status: 400 });
  const audience = typeof body.audience === "string" ? body.audience.trim() : undefined;
  const difficulty = typeof body.difficulty === "string" ? body.difficulty : "medium";

  let explicitTypes: PipelineBookType[] | null;
  let bundleSize: number;
  try {
    explicitTypes = normalizeBundleTypes(body.types);
    bundleSize = normalizeFiniteInteger(body.bundleSize, {
      field: "bundleSize",
      min: 2,
      max: 4,
      defaultValue: explicitTypes?.length ?? 4,
    });
    if (explicitTypes && bundleSize !== explicitTypes.length) {
      throw new GenerationInputError("bundleSize must match the number of unique types");
    }
  } catch (error) {
    if (error instanceof GenerationInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const costOf = (type: PipelineBookType) => costFor(type, { count: DEFAULT_COUNT[type] });
  const provisionalCost = explicitTypes
    ? explicitTypes.reduce((sum, type) => sum + costOf(type), 0)
    : [...PUZZLE_BOOK_TYPES].map(costOf).sort((a, b) => b - a).slice(0, bundleSize).reduce((sum, cost) => sum + cost, 0);

  const needsPenName = await penNameGate(user.id);
  if (needsPenName) return needsPenName;

  try {
    await assertFeature(user.id, "factory");
    await reserve(user.id, provisionalCost, "bundle");
  } catch (error) {
    const response = billingErrorResponse(error);
    if (response) return response;
    throw error;
  }

  let remainingReserved = provisionalCost;
  let bundleId: string | undefined;
  const compensate = async (amount: number, refId?: string) => {
    if (amount <= 0) return;
    await refund(user.id, amount, refId);
    remainingReserved -= amount;
  };

  try {
    let selected: PipelineBookType[];
    let analysis: TopicAnalysis;
    if (explicitTypes) {
      selected = explicitTypes;
      analysis = reusableAnalysis(body.analysis, selected);
    } else {
      analysis = await analyzeTopic({ topic, audience });
      const fit = (type: PipelineBookType) => analysis.types.find((item) => item.type === type)?.fit ?? 0;
      selected = [...PUZZLE_BOOK_TYPES].sort((a, b) => fit(b) - fit(a)).slice(0, bundleSize);
    }
    const fitOf = (type: PipelineBookType) => analysis.types.find((item) => item.type === type)?.fit ?? 0;
    const costByType = new Map(selected.map((type) => [type, costOf(type)]));
    const plannedCost = selected.reduce((sum, type) => sum + (costByType.get(type) ?? 0), 0);
    await compensate(provisionalCost - plannedCost, "bundle-over-reservation");

    const admin = getSupabaseAdminClient();
    const { data: bundle, error: insertError } = await admin
      .from("bundles")
      .insert({ user_id: user.id, topic, audience: audience ?? null, difficulty, book_types: selected, opportunity: analysis, status: "generating" })
      .select("id")
      .single();
    if (insertError || !bundle) throw new Error(insertError?.message ?? "Could not create bundle");
    bundleId = bundle.id as string;

    const books: Array<{ type: PipelineBookType; id?: string; title?: string; status: "completed" | "failed"; error?: string }> = [];
    for (const type of selected) {
      const bookCost = costByType.get(type) ?? 0;
      try {
        const generated = await generateAndStoreBook(
          user.id,
          { bookType: type, theme: topic, difficulty, count: DEFAULT_COUNT[type] },
          { opportunity: analysis, bundleId }
        );
        books.push({ type, id: generated.id, title: generated.title, status: "completed" });
        remainingReserved -= bookCost;
        try {
          await recordUsage(user.id, type, bookCost, "completed", generated.id, { topic });
        } catch (usageError) {
          console.error(`bundle usage recording for ${type} failed:`, usageError);
        }
      } catch (generationError) {
        console.error(`bundle book ${type} failed:`, generationError);
        books.push({ type, status: "failed", error: generationError instanceof Error ? generationError.message : "Generation failed" });
        await compensate(bookCost, bundleId);
        try {
          await recordUsage(user.id, type, bookCost, "failed", undefined, { topic });
        } catch (usageError) {
          console.error(`bundle failure usage recording for ${type} failed:`, usageError);
        }
      }
    }

    const okCount = books.filter((book) => book.status === "completed").length;
    const status = okCount === books.length ? "completed" : okCount === 0 ? "failed" : "partial";
    const { error: updateError } = await admin.from("bundles").update({ status }).eq("id", bundleId);
    if (updateError) throw new Error(updateError.message);
    const recommendedOrder = [...selected].sort((a, b) => fitOf(b) - fitOf(a));

    return NextResponse.json({
      id: bundleId,
      topic,
      status,
      books,
      recommendedOrder,
      opportunity: { opportunity: analysis.opportunity, band: analysis.band, factors: analysis.factors },
    });
  } catch (operationError) {
    try {
      await compensate(remainingReserved, bundleId ?? "bundle-setup");
    } catch (refundError) {
      console.error("bundle operation and compensation failed", { operationError, refundError, remainingReserved });
      throw new AggregateError([operationError, refundError], "Bundle failed and reserved credits could not be fully refunded");
    }
    console.error("bundle generation failed", operationError);
    return NextResponse.json({ error: "Bundle generation failed" }, { status: 500 });
  }
}
