"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlanActivate({ planKey, label }: { planKey: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function activate() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/billing/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planKey }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const j = await res.json().catch(() => ({}));
        setMsg(j.error ?? "Checkout isn't available yet.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={activate} disabled={busy} className="mt-3 w-full rounded-lg btn-nexa px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
        {busy ? "Activating…" : label}
      </button>
      {msg && <p className="mt-2 text-xs text-amber-600">{msg}</p>}
    </div>
  );
}
