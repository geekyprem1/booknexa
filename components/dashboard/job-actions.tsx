"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const btn = "rounded border border-rule-strong px-3 py-1.5 text-xs font-medium hover:bg-paper disabled:opacity-50";
const primary = "rounded-lg btn-nexa px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50";

export function JobActions({ jobId, status, bookId }: { jobId: string; status: string; bookId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = status === "queued" || status === "processing";

  async function act(method: "POST" | "DELETE", action?: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        method,
        headers: action ? { "Content-Type": "application/json" } : undefined,
        body: action ? JSON.stringify({ action }) : undefined,
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) {
        setError(payload?.error ?? "The job action failed. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("The job action could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "completed" && bookId && (
        <Link href={`/dashboard/books/${bookId}`} className={primary}>View</Link>
      )}
      {(status === "failed" || status === "cancelled") && (
        <button onClick={() => act("POST", "retry")} disabled={busy} className={primary}>Retry</button>
      )}
      {active && (
        <button onClick={() => act("POST", "cancel")} disabled={busy} className={btn}>Cancel</button>
      )}
      {!active && (
        <button onClick={() => act("DELETE")} disabled={busy} className={btn}>Delete</button>
      )}
      {error && <p role="alert" className="basis-full text-xs text-clay">{error}</p>}
    </div>
  );
}
