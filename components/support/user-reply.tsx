"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UserReply({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (closed) {
    return <p className="rounded-lg bg-paper p-3 text-sm text-ink-muted">This ticket is closed. Open a new ticket if you need more help.</p>;
  }

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/support/${ticketId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setBody("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-rule bg-paper-card p-4 shadow-sm">
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Add a reply…" className="w-full rounded-lg border border-rule-strong px-3 py-2 text-sm" />
      <div className="mt-2 flex items-center gap-3">
        <button onClick={send} disabled={busy || !body.trim()} className="rounded-lg btn-nexa px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? "Sending…" : "Send Reply"}
        </button>
        {err && <span className="text-xs text-clay">{err}</span>}
      </div>
    </div>
  );
}
