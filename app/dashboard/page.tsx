import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateSubscription } from "@/lib/billing";
import { Overview, type ReadyJob, type RecentBook, type WeeklySlots } from "@/components/dashboard/overview";
import { clampSlotLimit, holdsSlot, weekStartUtc, type PubStatus } from "@/lib/planner/core";

/** This week's slot usage for the overview strip. Null if the planner isn't available. */
async function loadWeeklySlots(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  readyBooks: number
): Promise<WeeklySlots | null> {
  const [profile, pubs, planned] = await Promise.all([
    supabase.from("profiles").select("weekly_slot_limit").eq("id", userId).maybeSingle(),
    supabase.from("publications").select("format, status").eq("week_start", weekStartUtc()),
    supabase.from("publications").select("book_id", { count: "exact", head: true }),
  ]);
  if (profile.error || pubs.error || planned.error) return null;
  const rows = (pubs.data ?? []) as { format: string; status: PubStatus }[];
  const used = (f: string) => rows.filter((r) => r.format === f && holdsSlot(r)).length;
  return {
    limit: clampSlotLimit(profile.data?.weekly_slot_limit),
    paperback: used("paperback"),
    ebook: used("ebook"),
    // Approximate: finished books minus planned rows (a book planned in two formats counts twice).
    backlog: Math.max(0, readyBooks - (planned.count ?? 0)),
  };
}

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

  const slots = user ? await loadWeeklySlots(supabase, user.id, readyCount ?? 0) : null;

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
      slots={slots}
    />
  );
}
