import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BundleGenerator } from "@/components/dashboard/bundle-generator";

export const dynamic = "force-dynamic";

interface BundleRow {
  id: string;
  topic: string;
  book_types: string[] | null;
  status: string;
  created_at: string;
}

export default async function BundlePage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("bundles")
    .select("id, topic, book_types, status, created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  const bundles = (data ?? []) as BundleRow[];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Profit Factory™</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Create multiple publishing assets from one niche. Enter a topic, and the
        Profit Factory™ recommends the best book mix and produces them all —
        with a suggested publishing order to maximize your KDP catalogue.
      </p>

      <div className="mt-4 rounded-xl border border-rule bg-paper p-4">
        <div className="text-xs font-semibold font-ledger uppercase tracking-wide text-ink-muted">What gets produced</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Word Search", "Sudoku", "Maze", "Coloring Book", "Ebook"].map((t) => (
            <span key={t} className="rounded-full bg-paper-card border border-rule px-3 py-1 text-xs font-medium text-ink-soft">
              {t}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Opportunity Score powers recommendations — every book type is scored for
          demand, competition, and monetization before production begins.
        </p>
      </div>

      <div className="mt-6">
        <BundleGenerator />
      </div>

      <h2 className="font-display mt-10 text-lg font-semibold">Your bundles</h2>
      {bundles.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No bundles yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule">
          {bundles.map((b) => (
            <li key={b.id}>
              <Link href={`/dashboard/bundle/${b.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-paper">
                <div>
                  <div className="text-sm font-medium">{b.topic}</div>
                  <div className="text-xs text-ink-muted">
                    {(b.book_types ?? []).length} books · {b.status} · {new Date(b.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-sm text-ink-muted">Open →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
