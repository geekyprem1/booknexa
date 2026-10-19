import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BAND_COLORS } from "@/lib/niche/score";
import { BOOK_TYPE_LABELS } from "@/lib/niche/types";
import type { NicheIdea, NicheReport } from "@/lib/niche/types";

export const dynamic = "force-dynamic";

export default async function NicheReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("niche_reports").select("*").eq("id", id).single();
  if (!data) notFound();
  const report = data as NicheReport;
  const ideas = (report.ideas ?? []) as NicheIdea[];

  const meta = [report.audience, report.category, report.country].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard/niche" className="text-sm text-ink-muted hover:underline">
        ← Profit Radar™
      </Link>

      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{report.keyword}</h1>
          <p className="text-sm text-ink-muted">
            {ideas.length} opportunities · {meta || "—"} ·{" "}
            {new Date(report.created_at).toLocaleDateString()}
          </p>
        </div>
        <a
          href={`/api/niche/${report.id}/export`}
          className="shrink-0 rounded border border-ink px-4 py-2 text-sm font-medium"
        >
          Export PDF
        </a>
      </div>

      <ul className="mt-6 space-y-3">
        {ideas.map((idea, i) => (
          <NicheCard key={i} idea={idea} rank={i + 1} />
        ))}
      </ul>
    </div>
  );
}

function NicheCard({ idea, rank }: { idea: NicheIdea; rank: number }) {
  const c = BAND_COLORS[idea.band];
  const f = idea.factors;
  const stats: Array<[string, number]> = [
    ["Demand", f.demand],
    ["Competition", f.competition],
    ["Evergreen", f.evergreen],
    ["Monetization", f.monetization],
  ];

  return (
    <li className="rounded-lg border border-rule p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
          {rank}
        </span>
        <h3 className="flex-1 font-semibold">{idea.niche}</h3>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: c.bg, color: c.fg }}
        >
          {idea.opportunity} · {idea.band}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {stats.map(([label, v]) => (
          <div key={label} className="rounded bg-paper py-1.5">
            <div className="text-[11px] font-ledger uppercase tracking-wide text-ink-muted">{label}</div>
            <div className="text-sm font-bold">{v}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-sm">
        <span className="font-medium">Recommended:</span>{" "}
        {BOOK_TYPE_LABELS[idea.recommendedBookType] ?? idea.recommendedBookType}
        <span className="text-ink-muted">
          {" "}
          (also: {idea.bookTypes.map((t) => BOOK_TYPE_LABELS[t] ?? t).join(", ")})
        </span>
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        <span className="font-medium">Seasonal:</span> {idea.seasonal}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">
        <span className="font-medium">Monetization:</span> {idea.monetizationNote}
      </p>

      <div className="mt-3">
        <Link
          href={`/dashboard/create?theme=${encodeURIComponent(idea.niche)}`}
          className="inline-block rounded-lg btn-nexa px-3 py-1.5 text-xs font-medium text-white"
        >
          Create Word Search Book
        </Link>
      </div>
    </li>
  );
}
