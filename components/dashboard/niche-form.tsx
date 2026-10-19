"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NicheForm() {
  const router = useRouter();
  const [keyword, setKeyword] = useState("");
  const [audience, setAudience] = useState("");
  const [category, setCategory] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "mt-1 w-full rounded border border-rule-strong px-3 py-2 text-sm";
  const label = "block text-sm font-medium text-ink-soft";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/niche", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          audience: audience || undefined,
          category: category || undefined,
          country: country || undefined,
        }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};
      if (!res.ok) {
        throw new Error(json.error ?? `Research failed (${res.status}). Please try again.`);
      }
      router.push(`/dashboard/niche/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-rule p-5">
      <div>
        <label className={label}>Keyword / topic *</label>
        <input
          className={field}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="e.g. mindfulness, trucks, gardening"
          required
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label}>Audience</label>
          <input
            className={field}
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            placeholder="e.g. kids, seniors, adults"
          />
        </div>
        <div>
          <label className={label}>Category</label>
          <input
            className={field}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. puzzles, planners"
          />
        </div>
      </div>
      <div>
        <label className={label}>Country (optional)</label>
        <input
          className={field}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="e.g. United States, UK"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg btn-nexa px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Researching 20 niches… (up to a minute)" : "Research Niches"}
      </button>

      {error && <p className="text-sm text-clay">{error}</p>}
    </form>
  );
}
