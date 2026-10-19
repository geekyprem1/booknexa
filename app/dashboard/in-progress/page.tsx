import Link from "next/link";
import { ListChecks } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recoverQueuedJobs } from "@/lib/jobs/job-queue";
import { BOOK_TYPE_LABELS, type BookType } from "@/lib/opportunity";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { ActiveProgress } from "@/components/dashboard/active-progress";
import { JobActions } from "@/components/dashboard/job-actions";
import { bookTypeMeta } from "@/components/dashboard/book-type-meta";

export const dynamic = "force-dynamic";

interface JobRow {
  id: string;
  book_id: string | null;
  job_type: string;
  status: string;
  progress: number;
  current_step: string | null;
  error_message: string | null;
  title: string | null;
  created_at: string;
}

const BADGE: Record<string, string> = {
  completed: "bg-forest-soft text-forest border border-forest/30",
  processing: "bg-marker-soft text-nexa-blue border border-nexa-blue/30",
  queued: "bg-paper-deep text-ink-soft border border-rule",
  failed: "bg-amber-50 text-amber-700 border border-amber-200",
  cancelled: "bg-paper-deep text-ink-muted border border-rule",
};

const BADGE_LABEL: Record<string, string> = {
  failed: "Needs Attention",
};

export default async function InProgressPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await recoverQueuedJobs(user.id); // best-effort restart recovery

  const { data } = await supabase
    .from("generation_jobs")
    .select("id, book_id, job_type, status, progress, current_step, error_message, title, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const jobs = (data ?? []) as JobRow[];
  const active = jobs.some((j) => j.status === "queued" || j.status === "processing");

  return (
    <div className="mx-auto max-w-3xl">
      <AutoRefresh active={active} />
      <div className="flex items-center gap-2">
        <span className="inline-block h-7 w-1.5 rounded-full nexa-bar-v" />
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Production Queue</h1>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Track books being generated in the background — you can leave and come back.
        Completed books appear in your Publishing Vault™ automatically.
      </p>

      {jobs.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-rule-strong bg-paper-card/60 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-marker-soft">
            <ListChecks className="h-6 w-6 text-nexa-indigo" />
          </span>
          <p className="mt-3 text-sm text-ink-muted">No jobs yet. <Link href="/dashboard/create" className="font-medium text-ink underline">Create a book</Link>.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {jobs.map((j) => {
            const meta = bookTypeMeta(j.job_type);
            const Icon = meta.icon;
            return (
            <li key={j.id} className="rounded-xl border border-rule bg-paper-card p-4 shadow-card">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: `${meta.tint}1a`, color: meta.tint }}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/dashboard/in-progress/${j.id}`} className="font-medium text-ink hover:underline">
                        {j.title || "Untitled"}
                      </Link>
                      <div className="text-xs text-ink-muted">
                        {BOOK_TYPE_LABELS[j.job_type as BookType] ?? j.job_type} · {new Date(j.created_at).toLocaleString()}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${BADGE[j.status] ?? ""}`}>{BADGE_LABEL[j.status] ?? j.status}</span>
                  </div>

                  {(j.status === "queued" || j.status === "processing") && (
                    <ActiveProgress progress={j.progress} currentStep={j.current_step} />
                  )}
                  {j.status === "failed" && j.error_message && (
                    <p className="mt-2 text-xs text-clay">{j.error_message}</p>
                  )}

                  <div className="mt-3">
                    <JobActions jobId={j.id} status={j.status} bookId={j.book_id} />
                  </div>
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
