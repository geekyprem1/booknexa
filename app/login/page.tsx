"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/logo";

/* Same focus treatment as the dashboard. */
const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/* The four "chapters" — mirrors the dashboard overview. */
const CHAPTERS = [
  { n: "I", label: "Find the niche", tool: "Profit Radar™" },
  { n: "II", label: "Build the book", tool: "Book Studio" },
  { n: "III", label: "Pack the listing", tool: "Launch Kit™" },
  { n: "IV", label: "Go live", tool: "Amazon KDP" },
];

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  function client() {
    try {
      return createSupabaseBrowserClient();
    } catch {
      setError("Authentication is not configured yet (missing Supabase env vars).");
      return null;
    }
  }

  // Auth redirect base. Prefer the public env (works in confirmation emails even
  // if the user starts the flow from localhost or a preview domain); fall back to
  // the browser origin when unset (dev / unconfigured).
  const authBase =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const callback = `${authBase}/auth/callback?next=/dashboard`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = client();
    if (!supabase) return setBusy(false);

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callback },
      });
      setBusy(false);
      if (error) return setError(error.message);
      // If email confirmation is on, there's no active session yet.
      if (!data.session) return setSent(true);
      window.location.href = "/dashboard";
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setBusy(false);
      if (error) return setError(error.message);
      window.location.href = "/dashboard";
    }
  }

  function toggleMode() {
    setMode(isSignup ? "signin" : "signup");
    setError(null);
  }

  const inputClass =
    "w-full min-h-[44px] rounded-md border border-rule-strong bg-white px-3.5 text-sm text-ink placeholder:text-ink-muted transition focus:outline-none focus-visible:border-nexa-blue focus-visible:ring-[3px] focus-visible:ring-nexa-blue/20";

  return (
    <div className="paper-grain press-motion flex min-h-screen flex-col font-ui text-ink">
      {/* ═══ Masthead ═══ */}
      <header className="mx-auto w-full max-w-[1200px] px-6 pt-6 lg:px-10">
        <div className="flex items-center justify-between gap-4 border-b border-ink pb-3">
          <Logo variant="light" className="h-9 text-base" />
          <span className="font-ledger text-xs uppercase tracking-widest text-ink-muted">
            {isSignup ? "New publisher" : "Member access"}
          </span>
        </div>
      </header>

      {/* ═══ Body ═══ */}
      <main className="mx-auto grid w-full max-w-[1200px] flex-1 items-center gap-8 px-6 py-10 lg:grid-cols-12 lg:gap-10 lg:px-10">
        {/* Lead story — brand panel (desktop) */}
        <section
          aria-hidden
          className="relative hidden overflow-hidden rounded-xl border-2 border-ink bg-ink p-10 text-white shadow-press lg:col-span-7 lg:flex lg:min-h-[520px] lg:flex-col lg:justify-between"
        >
          <span className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-nexa-violet/35 blur-3xl" />
          <span className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-nexa-cyan/20 blur-3xl" />
          <span className="pointer-events-none absolute right-1/3 top-1/2 h-56 w-56 rounded-full bg-nexa-blue/25 blur-3xl" />

          <div className="relative">
            <p className="font-ledger text-xs uppercase tracking-widest text-marker">The publishing OS for Amazon KDP</p>
            <h2 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight xl:text-5xl">
              From niche idea
              <br />
              to <span className="marker-hl">published</span> book.
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-paper/70">
              Spot real demand, produce print-ready interiors and covers, and ship a complete
              KDP listing — all from one workspace.
            </p>
          </div>

          <ol className="relative mt-10 space-y-3 font-ledger text-sm">
            {CHAPTERS.map((c) => (
              <li key={c.n} className="flex items-baseline gap-3">
                <span className="w-7 text-marker">{c.n}</span>
                <span className="text-white">{c.label}</span>
                <span className="flex-1 border-b-2 border-dotted border-white/20 -translate-y-1" />
                <span className="text-paper/60">{c.tool}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Form card */}
        <section className="mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none">
          <div className="rounded-xl border-2 border-ink bg-white p-7 shadow-press sm:p-9">
            <p className="font-ledger text-xs uppercase tracking-widest text-ink-muted">
              {isSignup ? "Create account" : "Sign in"}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {isSignup ? (
                <>Start your first <span className="marker-hl">edition</span>.</>
              ) : (
                <>Welcome back to the <span className="marker-hl">press</span>.</>
              )}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {isSignup
                ? "Set up your workspace and get a KDP-ready book on the shelf in minutes."
                : "Pick up where you left off. Your books, covers and drafts are waiting."}
            </p>

            {sent ? (
              <div
                role="status"
                className="mt-7 rounded-md border-2 border-forest bg-forest-soft p-4 text-sm leading-relaxed text-ink"
              >
                <strong className="block font-semibold">Check your inbox.</strong>
                We sent a confirmation link to <strong>{email}</strong>. Open it to activate your
                account, then come back here to sign in.
              </div>
            ) : (
              <form onSubmit={submit} className="mt-7 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-ink">
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isSignup ? "At least 6 characters" : "Enter your password"}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      className={`${inputClass} pr-16`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className={`absolute inset-y-1 right-1 rounded px-3 font-ledger text-[11px] uppercase tracking-wider text-ink-muted hover:text-ink ${FOCUS}`}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="rounded-md border-2 border-clay bg-clay-soft px-3.5 py-2.5 text-sm text-ink">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className={`btn-nexa mt-2 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md px-6 text-sm font-bold shadow-glow transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
                >
                  {busy
                    ? isSignup
                      ? "Creating account…"
                      : "Signing in…"
                    : isSignup
                      ? "Create my account"
                      : "Sign in to BookNexa"}
                  {!busy && <ArrowRight className="h-4 w-4" aria-hidden />}
                </button>
              </form>
            )}

            {!sent && (
              <p className="mt-7 border-t border-rule pt-5 text-center text-sm text-ink-soft">
                {isSignup ? "Already publishing with us?" : "New to BookNexa?"}{" "}
                <button
                  type="button"
                  onClick={toggleMode}
                  className={`rounded font-semibold text-nexa-blue underline-offset-4 hover:underline ${FOCUS}`}
                >
                  {isSignup ? "Sign in" : "Create a free account"}
                </button>
              </p>
            )}
          </div>
        </section>
      </main>

      {/* ═══ Footer ═══ */}
      <footer className="mx-auto w-full max-w-[1200px] px-6 pb-6 lg:px-10">
        <div className="nexa-bar h-[3px]" aria-hidden />
        <p className="pt-3 font-ledger text-[11px] uppercase tracking-wider text-ink-muted">
          Independent publishing software · Not affiliated with or endorsed by Amazon
        </p>
      </footer>
    </div>
  );
}
