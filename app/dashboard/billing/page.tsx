import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateSubscription, planKeyOf, PLANS, PLAN_ORDER } from "@/lib/billing";
import { PlanActivate } from "@/components/dashboard/plan-activate";

export const dynamic = "force-dynamic";

interface UsageRow {
  id: string;
  action: string;
  credits: number;
  status: string;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  market_intelligence: "Profit Radar™",
  title_optimizer: "Title Lab",
  word_search: "Word Search",
  sudoku: "Sudoku",
  maze: "Maze",
  coloring: "Coloring Book",
  ebook: "Ebook",
  cover: "Cover Studio",
};

export default async function BillingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const sub = await getOrCreateSubscription(user.id);
  const currentKey = planKeyOf(sub);
  const { data: usageData } = await supabase
    .from("usage_events")
    .select("id, action, credits, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const usage = (usageData ?? []) as UsageRow[];

  const creditsUsed = usage.filter((u) => u.status === "completed").reduce((s, u) => s + u.credits, 0);

  // last-7-days credit usage (completed)
  const days: Array<{ label: string; credits: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    const credits = usage
      .filter((u) => u.status === "completed" && u.created_at.slice(0, 10) === key)
      .reduce((s, u) => s + u.credits, 0);
    days.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), credits });
  }
  const maxDay = Math.max(1, ...days.map((d) => d.credits));

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Billing</h1>
      <p className="mt-1 text-sm text-ink-soft">Manage your plan, credits, and usage.</p>

      {/* current plan + credits */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-rule p-5">
          <div className="text-xs uppercase text-ink-muted">Current plan</div>
          <div className="mt-1 text-lg font-bold">{sub.plan_name}</div>
          <div className="text-xs text-ink-muted">{sub.renews_at ? `Renews ${new Date(sub.renews_at).toLocaleDateString()}` : "No renewal"}</div>
        </div>
        <div className="rounded-lg border border-rule p-5">
          <div className="text-xs uppercase text-ink-muted">Credits remaining</div>
          <div className="mt-1 text-3xl font-bold">{sub.credits_remaining}</div>
          <div className="text-xs text-ink-muted">of {sub.monthly_credits}/mo</div>
        </div>
        <div className="rounded-lg border border-rule p-5">
          <div className="text-xs uppercase text-ink-muted">Credits used</div>
          <div className="mt-1 text-3xl font-bold">{creditsUsed}</div>
          <div className="text-xs text-ink-muted">all time</div>
        </div>
      </div>

      {/* usage graph */}
      <div className="mt-6 rounded-lg border border-rule p-5">
        <h2 className="text-sm font-semibold text-ink-soft">Usage (last 7 days)</h2>
        <div className="mt-4 flex items-end gap-2" style={{ height: "80px" }}>
          {days.map((d, i) => (
            <div key={i} className="flex flex-1 flex-col items-center justify-end">
              <div className="w-full rounded-t nexa-bar-v" style={{ height: `${(d.credits / maxDay) * 64}px` }} title={`${d.credits} credits`} />
              <div className="mt-1 text-[11px] text-ink-muted">{d.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* plans */}
      <h2 className="font-display mt-8 text-lg font-semibold">Plans</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PLAN_ORDER.filter((k) => k !== "free").map((k) => {
          const p = PLANS[k];
          const isCurrent = k === currentKey;
          return (
            <div key={k} className={`rounded-lg border p-4 ${isCurrent ? "border-ink" : "border-rule"}`}>
              <div className="flex items-center justify-between">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm font-bold">${p.price}</div>
              </div>
              <div className="mt-1 text-xs text-ink-muted">{p.blurb}</div>
              <div className="mt-1 text-xs text-ink-muted">{p.monthlyCredits.toLocaleString()} credits/mo</div>
              {isCurrent ? (
                <div className="mt-3 rounded bg-paper-deep px-3 py-1.5 text-center text-xs font-medium text-ink-soft">Current plan</div>
              ) : (
                <PlanActivate planKey={k} label={`Activate ${p.name}`} />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-muted">Activation is simulated until a payment provider is connected (JVZoo, WarriorPlus, Stripe, Dodo, LemonSqueezy).</p>

      {/* usage history */}
      <h2 className="font-display mt-8 text-lg font-semibold">Usage history</h2>
      {usage.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No usage yet.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-rule text-left text-ink-muted">
              <th className="py-2 font-medium">Date</th>
              <th className="py-2 font-medium">Action</th>
              <th className="py-2 font-medium">Credits</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={u.id} className="border-b border-rule">
                <td className="py-2 text-ink-muted">{new Date(u.created_at).toLocaleString()}</td>
                <td className="py-2">{ACTION_LABELS[u.action] ?? u.action}</td>
                <td className="py-2">{u.credits}</td>
                <td className="py-2">
                  <span className={u.status === "completed" ? "text-forest" : u.status === "failed" ? "text-clay" : "text-ink-muted"}>{u.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
