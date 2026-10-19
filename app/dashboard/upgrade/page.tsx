import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getOrCreateSubscription } from "@/lib/billing";
import { UPSELL_OFFERS, type Offer } from "@/lib/offers";

export const dynamic = "force-dynamic";

function OfferCard({ offer }: { offer: Offer }) {
  const variants = offer.variants ?? [
    { label: "", price: offer.price, credits: offer.credits, checkoutUrl: offer.checkoutUrl },
  ];
  const buyable = variants.some((v) => v.checkoutUrl);

  return (
    <div className="flex flex-col overflow-hidden relative rounded-2xl border-2 border-ink bg-ink text-white shadow-press">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <span className="font-ledger text-[11px] uppercase tracking-widest text-marker">
          {offer.position}
        </span>
        {offer.featureReady ? (
          <span className="rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-[11px] font-semibold font-ledger uppercase tracking-wide text-emerald-200">
            Available now
          </span>
        ) : (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold font-ledger uppercase tracking-wide text-white/70">
            Launching soon
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 py-5">
        <h3 className="font-display text-xl font-bold">{offer.name}</h3>
        <p className="mt-1 text-sm leading-relaxed text-white/70">{offer.tagline}</p>

        <ul className="mt-4 flex flex-col gap-2">
          {offer.features.map((f) => (
            <li key={f} className="grid grid-cols-[16px_1fr] gap-2 text-sm text-white/80">
              <span className="mt-0.5 text-marker" aria-hidden>
                ✓
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex-1" />

        <div className="mt-4 flex flex-col gap-2">
          {variants.map((v) => {
            const label = v.label ? `Get ${v.label} — $${v.price}` : `Get it — $${v.price}`;
            const meta = `${v.credits > 0 ? `${v.credits.toLocaleString()} credits` : "no credits"} · one-time`;
            return v.checkoutUrl ? (
              <a
                key={v.label || "single"}
                href={v.checkoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-nexa block rounded-lg px-4 py-3 text-center text-sm font-bold shadow-glow transition-all"
              >
                {label}
                <span className="mt-0.5 block text-[11px] font-normal text-white/85">{meta}</span>
              </a>
            ) : (
              <div
                key={v.label || "single"}
                className="block cursor-not-allowed rounded-lg border border-white/10 bg-white/[0.05] px-4 py-3 text-center text-sm font-semibold text-white/65"
              >
                {v.label ? `${v.label} — $${v.price}` : `$${v.price}`}
                <span className="mt-0.5 block text-[11px] font-normal text-white/55">
                  Checkout link coming soon
                </span>
              </div>
            );
          })}
        </div>
        {!buyable && (
          <p className="mt-2 text-center text-[11px] text-white/55">
            This offer isn&apos;t open for purchase yet.
          </p>
        )}
      </div>
    </div>
  );
}

export default async function UpgradePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const sub = await getOrCreateSubscription(user.id);

  return (
    <div className="mx-auto max-w-6xl">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Upgrade &amp; Add-ons</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Stack more power onto your account — one-time offers, no subscription.
          </p>
        </div>
        <div className="rounded-xl border border-rule bg-paper-card px-4 py-2.5 text-right shadow-sm">
          <p className="text-[11px] font-ledger uppercase tracking-wide text-ink-muted">Your balance</p>
          <p className="font-ledger text-xl font-bold text-ink">
            {sub.credits_remaining.toLocaleString()}{" "}
            <span className="text-sm font-normal text-ink-muted">credits</span>
          </p>
        </div>
      </div>

      {/* How delivery works */}
      <div
        className="mt-5 rounded-xl border border-nexa-blue/30 bg-marker-soft px-4 py-3 text-sm text-ink-soft"
      >
        <span className="font-semibold">How it works:</span> checkout is handled securely on
        launchpadjv. Your credits and features are added to this account once your purchase is
        confirmed.
      </div>

      {/* Offer grid */}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {UPSELL_OFFERS.map((offer) => (
          <OfferCard key={offer.slug} offer={offer} />
        ))}
      </div>
    </div>
  );
}
