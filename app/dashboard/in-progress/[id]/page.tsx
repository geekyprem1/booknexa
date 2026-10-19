import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOB_STEPS } from "@/lib/jobs/job-progress";
import { BOOK_TYPE_LABELS, type BookType } from "@/lib/opportunity";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { GenerationProgress } from "@/components/dashboard/generation-progress";
import { JobActions } from "@/components/dashboard/job-actions";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase
    .from("generation_jobs")
    .select("id, book_id, job_type, status, progress, current_step, error_message, title, created_at, completed_at")
    .eq("id", id)
    .single();
  if (!job) notFound();

  const steps = JOB_STEPS[job.job_type] ?? [];
  const active = job.status === "queued" || job.status === "processing";
  const failed = job.status === "failed";

  return (
    <div className="mx-auto max-w-2xl">
      <AutoRefresh active={active} />
      <Link href="/dashboard/in-progress" className="text-sm text-ink-muted hover:underline">← Book In Progress</Link>
      <h1 className="mt-1 font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{job.title || "Untitled"}</h1>
      <p className="text-sm text-ink-muted">
        {BOOK_TYPE_LABELS[job.job_type as BookType] ?? job.job_type} · {job.status} · {new Date(job.created_at).toLocaleString()}
      </p>

      {failed && job.error_message && (
        <div className="mt-4 rounded-lg border border-clay/30 bg-clay-soft p-3 text-sm text-clay">{job.error_message}</div>
      )}

      <GenerationProgress
        status={job.status}
        progress={job.progress}
        currentStep={job.current_step}
        jobType={job.job_type}
        createdAt={job.created_at}
        steps={steps}
      />

      <div className="mt-6">
        <JobActions jobId={job.id} status={job.status} bookId={job.book_id} />
      </div>
    </div>
  );
}
