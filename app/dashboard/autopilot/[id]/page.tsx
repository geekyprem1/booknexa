import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recoverQueuedJobs } from "@/lib/jobs/job-queue";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { ActiveProgress } from "@/components/dashboard/active-progress";

export const dynamic = "force-dynamic";

interface Angle {
  title?: string;
  angle?: string;
  status?: "pending" | "writing" | "done" | "failed";
  bookId?: string | null;
  error?: string | null;
}

interface RunRow {
  id: string;
  niche: string;
  status: string;
  job_ids: string[] | null;
  angles: Angle[] | null;
  created_at: string;
}

const BADGE: Record<string, string> = {
  done: "bg-forest-soft text-forest",
  writing: "bg-marker-soft text-nexa-indigo",
  pending: "bg-paper-deep text-ink-soft",
  failed: "bg-amber-100 text-amber-800",
};

const STATUS_LABEL: Record<string, string> = {
  done: "Done",
  writing: "Writing",
  pending: "Queued",
  failed: "Needs Attention",
};

export default async function AutopilotRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await recoverQueuedJobs(user.id); // best-effort restart recovery

  const { data: run } = await supabase
    .from("autopilot_runs")
    .select("id, niche, status, job_ids, angles, created_at")
    .eq("id", id)
    .single();
  if (!run) notFound();
  const r = run as RunRow;

  const angles = r.angles ?? [];
  const total = angles.length || 3;
  const done = angles.filter((a) => a.status === "done").length;
  const active = r.status === "generating";

  // The single job carries the live step + smooth progress for the writing book.
  const jobId = r.job_ids?.[0];
  const { data: job } = jobId
    ? await supabase
        .from("generation_jobs")
        .select("progress, current_step, status")
        .eq("id", jobId)
        .maybeSingle()
    : { data: null };

  const overall = active && job ? Math.max(3, job.progress) : Math.round((done / total) * 100);

  return (
    <div className="mx-auto max-w-2xl">
      <AutoRefresh active={active} />
      <Link href="/dashboard/autopilot" className="text-sm text-ink-muted hover:underline">
        ← Autopilot
      </Link>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Autopilot</h1>
      <p className="text-sm text-ink-soft">
        Answer a few questions and we&apos;ll write 3 complete books — with covers — for you.
      </p>

      <div className="mt-6 rounded-lg border border-rule p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">
            {active ? "Writing your books…" : done === total ? "Your books are ready" : "Autopilot run"}
          </h2>
          <span className="rounded-full bg-marker-soft px-2.5 py-1 text-xs font-semibold text-nexa-indigo">
            {done}/{total} done
          </span>
        </div>

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-paper-deep">
          <div
            className="h-full rounded-full nexa-bar transition-all duration-700 ease-out"
            style={{ width: `${Math.max(3, overall)}%` }}
          />
        </div>

        <ul className="mt-4 space-y-2">
          {angles.map((a, i) => {
            const status = a.status ?? "pending";
            return (
              <li key={i} className="rounded-lg border border-rule p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-soft text-xs font-semibold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      {status === "done" && a.bookId ? (
                        <Link href={`/dashboard/books/${a.bookId}`} className="font-medium hover:underline">
                          {a.title || "Untitled"}
                        </Link>
                      ) : (
                        <div className="font-medium">{a.title || "Untitled"}</div>
                      )}
                      <div className="text-xs text-ink-muted">
                        {status === "failed"
                          ? a.error || "Generation failed"
                          : status === "done"
                            ? "Manuscript & cover ready"
                            : status === "writing"
                              ? job?.current_step ?? "Writing…"
                              : "Waiting to start"}
                      </div>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${BADGE[status] ?? ""}`}>
                    {STATUS_LABEL[status] ?? status}
                  </span>
                </div>

                {status === "writing" && (
                  <ActiveProgress progress={job?.progress ?? 5} currentStep={job?.current_step ?? null} />
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-4 text-xs text-ink-muted">
          This runs in the background and can take a while per book. You can leave this page —
          completed books appear in your Publishing Vault™ automatically.
        </p>
      </div>
    </div>
  );
}
