"use client";

import { useEffect, useState } from "react";

interface Step {
  label: string;
  at: number;
}

/** Reassuring, lively "something is being built" view for an active generation job.
 *  Real signals (progress %, current_step, elapsed time) drive it; the rotating
 *  flavor line is purely cosmetic so the user feels activity while they wait.
 *  All values derive from absolute time, so the 3s auto-refresh remount never
 *  jumps the timer or message. */
const FLAVOR: Record<string, string[]> = {
  ebook: [
    "Researching your topic…",
    "Outlining the chapters…",
    "Writing the first drafts…",
    "Polishing the prose…",
    "Formatting your manuscript…",
  ],
  coloring: [
    "Dreaming up cute scenes…",
    "Sketching the line art…",
    "Inking bold, kid-friendly outlines…",
    "Designing your cover…",
    "Assembling the pages…",
  ],
  word_search: [
    "Building the letter grids…",
    "Hiding the words…",
    "Generating answer keys…",
    "Laying out the pages…",
    "Rendering the print PDF…",
  ],
  sudoku: [
    "Crafting unique-solution puzzles…",
    "Balancing the difficulty…",
    "Generating answer keys…",
    "Laying out the pages…",
    "Rendering the print PDF…",
  ],
  maze: [
    "Carving the maze paths…",
    "Checking every solution…",
    "Drawing the answer keys…",
    "Laying out the pages…",
    "Rendering the print PDF…",
  ],
  default: [
    "Warming up the generators…",
    "Putting the pieces together…",
    "Designing the layout…",
    "Almost there…",
    "Finishing touches…",
  ],
};

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function GenerationProgress({
  status,
  progress,
  currentStep,
  jobType,
  createdAt,
  steps,
}: {
  status: string;
  progress: number;
  currentStep: string | null;
  jobType: string;
  createdAt: string;
  steps: Step[];
}) {
  const active = status === "queued" || status === "processing";
  const completed = status === "completed";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  const elapsedMs = now - new Date(createdAt).getTime();
  const messages = FLAVOR[jobType] ?? FLAVOR.default;
  const flavor = messages[Math.floor(elapsedMs / 2500) % messages.length];

  return (
    <div>
      {active && (
        <div className="mt-5 rounded-xl border border-rule bg-paper-card p-4 shadow-sm">
          {/* header: spinner + current step + elapsed */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-4 w-4 rounded-full border-2 border-rule-strong border-t-neutral-900"
                style={{ animation: "bnx-spin 0.8s linear infinite" }}
              />
              <span className="text-sm font-semibold text-ink">
                {currentStep ?? "Working…"}
              </span>
            </div>
            <span className="text-xs tabular-nums text-ink-muted">{fmt(elapsedMs)} elapsed</span>
          </div>

          {/* animated progress bar with shimmer */}
          <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-paper-deep">
            <div
              className="h-full rounded-full nexa-bar transition-all duration-700 ease-out"
              style={{ width: `${Math.max(5, progress)}%` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
              style={{
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
                animation: "bnx-shimmer 1.6s ease-in-out infinite",
              }}
            />
          </div>

          {/* rotating reassurance */}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs italic text-ink-muted">{flavor}</span>
            <span className="text-xs font-medium text-ink-muted">{progress}%</span>
          </div>

          <p className="mt-3 rounded-lg bg-paper px-3 py-2 text-xs text-ink-muted">
            ✨ You can leave this page — your book keeps generating in the background and
            lands in your Publishing Vault™ when it's done.
          </p>
        </div>
      )}

      {/* timeline */}
      <h2 className="mt-6 text-sm font-semibold text-ink-soft">Timeline</h2>
      <ol className="mt-3 space-y-2.5">
        {steps.map((s) => {
          const done = completed || progress >= s.at;
          const current = !done && active && progress < s.at;
          return (
            <li key={s.label} className="flex items-center gap-2.5 text-sm">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                  done ? "bg-forest text-white" : current ? "bg-amber-400 text-white" : "bg-rule text-ink-muted"
                }`}
                style={current ? { animation: "bnx-pulse 1.2s ease-in-out infinite" } : undefined}
              >
                {done ? "✓" : ""}
              </span>
              <span className={done ? "text-ink" : current ? "font-medium text-ink" : "text-ink-muted"}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
