import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ShelfCreateForm } from "@/components/dashboard/shelves/shelf-create-form";
import { DEFAULT_COVER_BG } from "@/components/dashboard/shelves/ui";

export const dynamic = "force-dynamic";

interface ShelfListRow {
  id: string;
  name: string;
  niche: string | null;
  audience: string | null;
  pen_name: string | null;
  cover_style: { background?: string } | null;
  created_at: string;
  books: { count: number }[] | null;
  series: { count: number }[] | null;
}

export default async function ShelvesPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("shelves")
    .select("id, name, niche, audience, pen_name, cover_style, created_at, books(count), series(count)")
    .order("created_at", { ascending: false })
    .limit(200);
  const shelves = (data ?? []) as ShelfListRow[];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">Shelves</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        A shelf is one niche and one audience. Put every book for that buyer here, turn the good ones into numbered
        series, and give each new volume the same pen name and cover look.
      </p>

      <div className="mt-6">
        <ShelfCreateForm />
      </div>

      {shelves.length === 0 ? (
        <div className="mt-8 rounded-xl border-2 border-dashed border-rule p-8 text-center">
          <p className="font-display text-xl font-bold text-ink">No shelves yet.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Create one above, or open any finished book in the Vault and choose “Make this a series”.
          </p>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {shelves.map((s) => {
            const books = s.books?.[0]?.count ?? 0;
            const series = s.series?.[0]?.count ?? 0;
            const color = s.cover_style?.background ?? DEFAULT_COVER_BG;
            return (
              <li key={s.id}>
                <Link
                  href={`/dashboard/shelves/${s.id}`}
                  className="flex h-full gap-4 rounded-xl border-2 border-ink bg-paper-card p-4 shadow-card transition-transform motion-safe:hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
                >
                  <span className="flex items-end gap-1" aria-hidden>
                    {[56, 72, 64].map((h, i) => (
                      <span key={i} className="w-3 rounded-t-sm border border-ink" style={{ height: h, backgroundColor: color, opacity: i < Math.max(1, Math.min(3, books)) ? 1 : 0.25 }} />
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-display text-lg font-bold text-ink">{s.name}</span>
                    {s.niche && <span className="block truncate text-sm text-ink-soft">{s.niche}</span>}
                    <span className="mt-1 block font-ledger text-xs uppercase text-ink-muted">
                      {books} book{books === 1 ? "" : "s"} · {series} series{s.pen_name ? ` · ${s.pen_name}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
