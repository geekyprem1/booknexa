import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NicheForm } from "@/components/dashboard/niche-form";

export const dynamic = "force-dynamic";

interface ReportRow {
  id: string;
  keyword: string;
  audience: string | null;
  category: string | null;
  ideas: unknown[];
  created_at: string;
}

export default async function NicheResearchPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("niche_reports")
    .select("id, keyword, audience, category, ideas, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const reports = (data ?? []) as ReportRow[];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Profit Radar™</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Know what sells before you build. Enter a topic and get 20 scored
        opportunities — demand, competition, evergreen &amp; monetization — with the
        recommended book type for each.
      </p>

      <div className="mt-6">
        <NicheForm />
      </div>

      <h2 className="font-display mt-10 text-lg font-semibold">Past research</h2>
      {reports.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No research yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/niche/${r.id}`}
                className="flex items-center justify-between rounded-lg border border-rule p-4 hover:bg-paper"
              >
                <div>
                  <div className="font-medium">{r.keyword}</div>
                  <div className="text-xs text-ink-muted">
                    {Array.isArray(r.ideas) ? r.ideas.length : 0} niches ·{" "}
                    {[r.audience, r.category].filter(Boolean).join(" · ") || "—"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-sm text-ink-muted">View →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
