"use client";

/** Compact animated progress for a job row in the in-progress list. Shimmer bar +
 *  spinner + current step, so each active job in the list also feels alive. */
export function ActiveProgress({ progress, currentStep }: { progress: number; currentStep: string | null }) {
  return (
    <div className="mt-3">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-paper-deep">
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
      <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
        <span
          className="inline-block h-3 w-3 rounded-full border-2 border-rule-strong border-t-neutral-700"
          style={{ animation: "bnx-spin 0.8s linear infinite" }}
        />
        {currentStep ?? "Working…"} · {progress}%
      </div>
    </div>
  );
}
