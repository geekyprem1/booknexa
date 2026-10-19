"use client";

import { useEffect, useState } from "react";

/** Lively loading panel for synchronous (single-request) generations like the
 *  Cover Studio, where there's no server-side progress to poll. Shows an
 *  indeterminate shimmer bar, a spinner, rotating reassurance messages, and a
 *  live elapsed timer so the wait feels active instead of a dead button. */
export function InlineGenerating({ messages, note }: { messages: string[]; note?: string }) {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsedMs = now - start;
  const msg = messages[Math.floor(elapsedMs / 2500) % messages.length];
  const s = Math.floor(elapsedMs / 1000);
  const time = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="mt-4 rounded-xl border border-rule bg-paper-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded-full border-2 border-rule-strong border-t-neutral-900"
            style={{ animation: "bnx-spin 0.8s linear infinite" }}
          />
          <span className="text-sm font-semibold text-ink">{msg}</span>
        </div>
        <span className="text-xs tabular-nums text-ink-muted">{time}</span>
      </div>

      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-paper-deep">
        <div
          className="absolute inset-y-0 rounded-full nexa-bar"
          style={{ width: "40%", animation: "bnx-indeterminate 1.3s ease-in-out infinite" }}
        />
      </div>

      {note && <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-xs text-ink-muted">{note}</p>}
    </div>
  );
}
