import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BOOK_TYPE_LABELS, type BookType } from "@/lib/opportunity";
import { costFor, type CostableAction } from "@/lib/billing/cost";
import { normalizeCoverStyle } from "@/lib/shelves/core";
import { SeriesCard } from "@/components/dashboard/shelves/series-card";
import { ShelfSettings } from "@/components/dashboard/shelves/shelf-settings";
import { AddBooks } from "@/components/dashboard/shelves/add-books";
import { BTN_PRIMARY, DEFAULT_COVER_BG } from "@/components/dashboard/shelves/ui";

export const dynamic = "force-dynamic";

interface SeriesRow {
  id: string;
  name: string;
  book_type: string;
  base_input: Record<string, unknown> | null;
  title_pattern: string;
  subthemes: string[] | null;
  next_volume: number;
}
interface BookRow {
  id: string;
  title: string;
  book_type: string;
  status: string;
  page_count: number | null;
  series_id: string | null;
  volume_no: number | null;
  shelf_id?: string | null;
}

const typeLabel = (t: string) => BOOK_TYPE_LABELS[t as BookType] ?? t;

export default async function ShelfDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: shelf } = await supabase
    .from("shelves")
    .select("id, name, niche, audience, pen_name, cover_style")
    .eq("id", id)
    .maybeSingle();
  if (!shelf) notFound();

  const [{ data: seriesData }, { data: bookData }, { data: candidateData }] = await Promise.all([
    supabase
      .from("series")
      .select("id, name, book_type, base_input, title_pattern, subthemes, next_volume")
      .eq("shelf_id", id)
      .order("created_at"),
    supabase
      .from("books")
      .select("id, title, book_type, status, page_count, series_id, volume_no")
      .eq("shelf_id", id)
      .order("created_at"),
    supabase
      .from("books")
      .select("id, title, book_type, status, page_count, series_id, volume_no, shelf_id")
      .neq("book_type", "story")
      .or(`shelf_id.is.null,shelf_id.neq.${id}`)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const series = (seriesData ?? []) as SeriesRow[];
  const books = (bookData ?? []) as BookRow[];
  const candidates = ((candidateData ?? []) as BookRow[]).filter((b) => b.status === "completed");

  const style = normalizeCoverStyle(shelf.cover_style);
  const spineColor = style.background ?? DEFAULT_COVER_BG;
  const oneOffs = books.filter((b) => !b.series_id);
  const newBookHref = `/dashboard/create?shelf=${shelf.id}${shelf.niche ? `&theme=${encodeURIComponent(shelf.niche)}` : ""}`;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/shelves" className="text-sm text-ink-muted hover:underline">← Shelves</Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{shelf.name}</h1>
          <p className="text-sm text-ink-soft">
            {[shelf.niche, shelf.audience].filter(Boolean).join(" · ") || "No niche set"}
            {shelf.pen_name ? ` · by ${shelf.pen_name}` : ""}
          </p>
        </div>
        <Link href={newBookHref} className={BTN_PRIMARY}>
          <Plus className="h-4 w-4" aria-hidden /> New book on this shelf
        </Link>
      </div>

      <ShelfSettings
        shelf={{
          id: shelf.id,
          name: shelf.name,
          niche: shelf.niche,
          audience: shelf.audience,
          penName: shelf.pen_name,
          background: style.background,
          spineColor: style.spineColor,
        }}
      />

      <h2 className="mt-10 font-display text-2xl font-bold text-ink">Series</h2>
      {series.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">
          No series yet. Open a finished book below (or in the Vault) and choose “Make this a series”.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {series.map((s) => {
            const base = s.base_input ?? {};
            const count = typeof base.count === "number" ? base.count : undefined;
            return (
              <SeriesCard
                key={s.id}
                series={{
                  id: s.id,
                  name: s.name,
                  typeLabel: typeLabel(s.book_type),
                  titlePattern: s.title_pattern,
                  subthemes: s.subthemes ?? [],
                  nextVolume: s.next_volume,
                  themed: typeof base.theme === "string" && base.theme.length > 0,
                  unitCost: costFor(s.book_type as CostableAction, { count }),
                }}
                volumes={books
                  .filter((b) => b.series_id === s.id)
                  .map((b) => ({ id: b.id, title: b.title, status: b.status, volumeNo: b.volume_no }))}
                spineColor={spineColor}
              />
            );
          })}
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-ink">Other books on this shelf</h2>
        <AddBooks
          shelfId={shelf.id}
          candidates={candidates.map((b) => ({ id: b.id, title: b.title, typeLabel: typeLabel(b.book_type) }))}
        />
      </div>
      {oneOffs.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">Nothing here yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule bg-paper-card">
          {oneOffs.map((b) => (
            <li key={b.id}>
              <Link href={`/dashboard/books/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{b.title}</span>
                  <span className="text-xs text-ink-muted">
                    {typeLabel(b.book_type)} · {b.status}
                    {b.page_count ? ` · ${b.page_count} pages` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-ink-muted">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
