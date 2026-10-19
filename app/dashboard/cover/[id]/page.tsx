import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCoverVariationSignedUrl } from "@/lib/storage";
import { CoverResults } from "@/components/dashboard/cover-results";

export const dynamic = "force-dynamic";

export default async function CoverDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: cover } = await supabase
    .from("covers")
    .select("id, user_id, title, subtitle, genre, layout, typography, variation_keys, concepts")
    .eq("id", id)
    .single();
  if (!cover) notFound();

  const { data: bookData } = await supabase
    .from("books")
    .select("id, title")
    .order("created_at", { ascending: false })
    .limit(50);
  const books = (bookData ?? []) as Array<{ id: string; title: string }>;

  const keys = (cover.variation_keys as string[] | null) ?? [];
  const concepts = (cover.concepts as Array<{ layout?: string; score?: number; breakdown?: unknown; visualQuality?: unknown; bg_source?: string }> | null) ?? [];
  const urls = await Promise.all(
    keys.map((key, index) => getCoverVariationSignedUrl(key, cover.user_id, cover.id, index, 600))
  );
  const variations = urls.map((url, index) => ({
    url, index,
    score: concepts[index]?.score,
    layout: concepts[index]?.layout,
    breakdown: (concepts[index]?.breakdown ?? null) as import("@/components/dashboard/cover-results").ScoreBreakdown | null,
    visualQuality: (concepts[index]?.visualQuality ?? null) as import("@/components/dashboard/cover-results").VisualQuality | null,
    bg_source: (concepts[index]?.bg_source ?? null) as "image" | "gradient" | null,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/cover-v2" className="text-sm text-ink-muted hover:underline">← Cover Studio</Link>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{cover.title}</h1>
      {cover.subtitle && <p className="text-sm text-ink-soft">{cover.subtitle}</p>}
      <div className="mt-6">
        <CoverResults
          coverId={cover.id}
          variations={variations}
          books={books}
          brief={{ layout: cover.layout ?? undefined, typography: cover.typography ?? undefined }}
        />
      </div>
    </div>
  );
}
