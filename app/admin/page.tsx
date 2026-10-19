import Link from "next/link";
import { adminMetrics } from "@/lib/admin";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="mt-1 text-3xl font-bold text-neutral-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-neutral-400">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default async function AdminDashboard() {
  const m = await adminMetrics();

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Admin Command Center</h1>
        <p className="mt-1 text-sm text-neutral-600">Operate BookNexa — users, support, jobs, and billing in one place.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total Users" value={m.totalUsers.toLocaleString()} href="/admin/users" />
        <Stat label="Active (30d)" value={m.activeUsers.toLocaleString()} hint="with generations" />
        <Stat label="Paid Users" value={m.paidUsers.toLocaleString()} />
        <Stat label="Revenue" value={`$${m.revenue.toLocaleString()}`} hint="paid plans" href="/admin/billing" />
        <Stat label="Credits Used" value={m.creditsConsumed.toLocaleString()} />
        <Stat label="Books Generated" value={m.booksGenerated.toLocaleString()} href="/admin/books" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Jobs */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">Generation Jobs</h2>
            <Link href="/admin/jobs" className="text-xs text-neutral-400 hover:underline">Monitor →</Link>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2 text-center">
            {[
              { k: "queued", c: "text-neutral-600" },
              { k: "processing", c: "text-blue-600" },
              { k: "completed", c: "text-green-600" },
              { k: "failed", c: "text-amber-600" },
              { k: "cancelled", c: "text-neutral-400" },
            ].map((s) => (
              <div key={s.k} className="rounded-lg bg-neutral-50 p-2">
                <div className={`text-xl font-bold ${s.c}`}>{m.jobsByStatus[s.k] ?? 0}</div>
                <div className="text-[10px] capitalize text-neutral-400">{s.k}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tickets */}
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-700">Support Tickets</h2>
            <Link href="/admin/tickets" className="text-xs text-neutral-400 hover:underline">Open center →</Link>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            {[
              { k: "open", c: "text-amber-600" },
              { k: "pending", c: "text-blue-600" },
              { k: "answered", c: "text-green-600" },
              { k: "closed", c: "text-neutral-400" },
            ].map((s) => (
              <div key={s.k} className="rounded-lg bg-neutral-50 p-2">
                <div className={`text-xl font-bold ${s.c}`}>{m.ticketsByStatus[s.k] ?? 0}</div>
                <div className="text-[10px] capitalize text-neutral-400">{s.k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
