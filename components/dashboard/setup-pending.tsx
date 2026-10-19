import Link from "next/link";
import { LifeBuoy, CheckCircle2 } from "lucide-react";

/**
 * Interim screen for add-ons that are fulfilled manually (Agency, Reseller).
 * The buyer owns the offer; setup is completed by the support team.
 */
export function SetupPending({
  title,
  intro,
  perks,
}: {
  title: string;
  intro: string;
  perks: string[];
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{title}</h1>

      <div className="mt-6 rounded-2xl border border-rule bg-paper-card p-8">
        <div className="inline-flex items-center gap-2 rounded-full bg-forest-soft px-3 py-1 text-xs font-semibold text-forest">
          <CheckCircle2 className="h-4 w-4" /> Purchase confirmed
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">{intro}</p>

        {perks.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2">
            {perks.map((p) => (
              <li key={p} className="grid grid-cols-[18px_1fr] gap-2 text-sm text-ink-soft">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-forest" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 rounded-xl border border-rule bg-paper p-5">
          <h2 className="text-sm font-semibold text-ink">Next step: contact our support team</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Your account setup is completed manually so we can configure it correctly for you.
            Open a support ticket and our team will get you set up — usually within 24 hours.
          </p>
          <Link
            href="/dashboard/support"
            className="mt-4 inline-flex items-center gap-2 rounded-lg btn-nexa px-5 py-2.5 text-sm font-bold text-white"
          >
            <LifeBuoy className="h-4 w-4" /> Contact support team
          </Link>
        </div>
      </div>
    </div>
  );
}
