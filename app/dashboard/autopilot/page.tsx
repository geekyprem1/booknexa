import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AutopilotForm } from "@/components/dashboard/autopilot-form";

export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  niche: string;
  status: string;
  words_per_book: number;
  trim_size: string;
  created_at: string;
}

export default async function AutopilotPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("autopilot_runs")
    .select("id, niche, status, words_per_book, trim_size, created_at")
    .order("created_at", { ascending: false })
    .limit(12);
  const runs = (data ?? []) as RunRow[];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Autopilot</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Answer a few questions and we&apos;ll write 3 complete books — with covers — for you.
      </p>

      <div className="mt-6">
        <AutopilotForm />
      </div>

      <h2 className="font-display mt-10 text-lg font-semibold">Past runs</h2>
      {runs.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">
          No runs yet. Books appear in your{" "}
          <Link href="/dashboard/in-progress" className="underline">
            Production Queue
          </Link>{" "}
          while they generate.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {runs.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/autopilot/${r.id}`}
                className="flex items-center justify-between rounded-lg border border-rule p-4 hover:bg-paper"
              >
                <div>
                  <div className="font-medium">{r.niche}</div>
                  <div className="text-xs text-ink-muted">
                    {r.words_per_book.toLocaleString()} words · {r.trim_size} ·{" "}
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
                <span className="text-xs capitalize text-ink-muted">{r.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
