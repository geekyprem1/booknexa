import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listMyTickets } from "@/lib/support/tickets";
import { NewTicket } from "@/components/support/new-ticket";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  pending: "bg-marker-soft text-nexa-blue",
  answered: "bg-forest-soft text-forest",
  closed: "bg-paper-deep text-ink-muted",
};

export default async function SupportPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const tickets = user ? await listMyTickets(user.id) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Support</h1>
          <p className="mt-1 text-sm text-ink-soft">Get help from the BookNexa team. We typically reply within a day.</p>
        </div>
      </div>

      <NewTicket />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Your Tickets</h2>
        {tickets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-rule-strong p-8 text-center text-sm text-ink-muted">
            No tickets yet. Open one above if you need help.
          </p>
        ) : (
          <ul className="divide-y divide-rule rounded-xl border border-rule bg-paper-card shadow-sm">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/dashboard/support/${t.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-paper">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.subject}</div>
                    <div className="text-xs capitalize text-ink-muted">{t.category.replace("_", " ")} · {new Date(t.created_at).toLocaleDateString()}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[t.status] ?? ""}`}>{t.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
