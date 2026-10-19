import Link from "next/link";

const STEPS: Array<{ n: string; label: string; sub: string; href: string }> = [
  { n: "1", label: "Research", sub: "Profit Radar™", href: "/dashboard/niche" },
  { n: "2", label: "Create", sub: "Book Studio", href: "/dashboard/create" },
  { n: "3", label: "Package", sub: "Launch Kit™", href: "/dashboard/books" },
  { n: "4", label: "Publish", sub: "Upload to KDP", href: "/dashboard/books" },
];

/** The Research → Create → Package → Publish workflow stepper. */
export function WorkflowBanner() {
  return (
    <div className="rounded-xl border border-rule bg-gradient-to-r from-paper to-paper-card p-4">
      <div className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1">
            <Link
              href={s.href}
              className="group flex min-w-[7.5rem] items-center gap-3 rounded-lg px-3 py-2 hover:bg-paper-deep"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
                {s.n}
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-semibold text-ink">{s.label}</span>
                <span className="block text-[11px] text-ink-muted">{s.sub}</span>
              </span>
            </Link>
            {i < STEPS.length - 1 && <span className="px-1 text-ink-faint">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
