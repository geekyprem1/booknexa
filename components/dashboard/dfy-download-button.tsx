"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function DfyDownloadButton({ assetId }: { assetId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dfy-assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Download failed.");
        return;
      }
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setError("Download failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg btn-nexa px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {busy ? "Preparing…" : "Download"}
      </button>
      {error && <p className="mt-1 text-xs text-clay">{error}</p>}
    </div>
  );
}
