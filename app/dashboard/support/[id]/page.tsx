import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTicketWithReplies } from "@/lib/support/tickets";
import { TicketThread } from "@/components/support/ticket-thread";
import { UserReply } from "@/components/support/user-reply";

export const dynamic = "force-dynamic";

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const data = await getTicketWithReplies(id);
  if (!data) notFound();
  // Ownership: a user may only view their own ticket.
  if (data.ticket.user_id !== user.id) notFound();

  const { ticket, replies } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href="/dashboard/support" className="text-sm text-ink-muted hover:underline">← All tickets</Link>

      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{ticket.subject}</h1>
        <p className="mt-1 text-sm capitalize text-ink-muted">
          {ticket.category.replace("_", " ")} · {ticket.priority} priority · status <span className="font-medium">{ticket.status}</span>
        </p>
      </div>

      <TicketThread replies={replies} />

      <UserReply ticketId={ticket.id} closed={ticket.status === "closed"} />
    </div>
  );
}
