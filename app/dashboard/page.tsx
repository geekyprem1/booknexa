import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateSubscription } from "@/lib/billing";
import { Overview, type ReadyJob, type RecentBook } from "@/components/dashboard/overview";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [
    sub,
    { count: bookCount },
    { count: downloadCount },
    { count: inProgressCount },
    { count: readyCount },
    { count: needsAttentionCount },
    { count: nicheCount },
    { data: recentData },
    { data: readyData },
  ] = await Promise.all([
    user ? getOrCreateSubscription(user.id) : Promise.resolve(null),
    supabase.from("books").select("*", { count: "exact", head: true }),
    supabase.from("downloads").select("*", { count: "exact", head: true }),
    supabase.from("generation_jobs").select("*", { count: "exact", head: true }).in("status", ["queued", "processing"]),
    supabase.from("books").select("*", { count: "exact", head: true }).eq("status", "completed"),
    supabase.from("books").select("*", { count: "exact", head: true }).eq("status", "failed"),
    supabase.from("niche_reports").select("*", { count: "exact", head: true }),
    supabase.from("books").select("id, title, book_type, status, created_at").order("created_at", { ascending: false }).limit(7),
    supabase.from("generation_jobs").select("id, title, book_id, job_type").eq("status", "completed").gte("completed_at", dayAgo).order("completed_at", { ascending: false }).limit(3),
  ]);

  // Friendly first name: profile full_name → email local-part → "publisher".
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const rawName = (typeof meta.full_name === "string" && meta.full_name) || user?.email?.split("@")[0] || "";
  const firstName = rawName.split(/[\s._-]+/)[0] ?? "";
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "publisher";

  return (
    <Overview
      displayName={displayName}
      planName={sub?.plan_name ?? "Free Trial"}
      planType={sub?.plan_type ?? "free"}
      creditsRemaining={sub?.credits_remaining ?? 0}
      monthlyCredits={sub?.monthly_credits ?? 0}
      books={bookCount ?? 0}
      readyBooks={readyCount ?? 0}
      processing={inProgressCount ?? 0}
      attention={needsAttentionCount ?? 0}
      nicheCount={nicheCount ?? 0}
      downloadCount={downloadCount ?? 0}
      recent={(recentData ?? []) as RecentBook[]}
      ready={(readyData ?? []) as ReadyJob[]}
    />
  );
}
