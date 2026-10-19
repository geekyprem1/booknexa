import Link from "next/link";
import { Logo } from "@/components/brand/logo";

const FEATURES = [
  { title: "Profit Radar™", desc: "Discover profitable niches before creating books — demand, competition, evergreen & monetization scoring." },
  { title: "Book Studio", desc: "Create professional KDP books using guided workflows — print-ready and KDP-validated in minutes." },
  { title: "Profit Factory™", desc: "Create complete publishing assets at scale — turn one niche into a full multi-book bundle." },
  { title: "Cover Studio", desc: "Generate multiple commercial-ready cover concepts, scored for impact, with KDP-ready PNG and PDF exports." },
  { title: "Launch Kit™", desc: "Every book ships with metadata, keywords, categories, description & a publish checklist — in one ZIP." },
  { title: "Production Queue", desc: "Start a book and walk away. It finishes in the background and lands in your Publishing Vault™ automatically." },
];

const FRONT_END_FEATURES = ["Word Search", "Sudoku", "Maze", "Launch Kit"];
// TODO: replace with the real launchpadjb checkout URL for the Front End offer.
const BUY_URL = "#";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-black text-white">

      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-8 py-5">
        <Logo variant="dark" className="h-10 text-base" />
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-white/60 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link
            href="#pricing"
            className="rounded-lg btn-brand px-5 py-2 text-sm font-semibold transition-opacity"
          >
            Buy Now — $17
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-8 pb-24 pt-20 text-center">
          <div className="inline-block rounded-full border border-[#2563EB]/40 bg-[#2563EB]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#2563EB]">
            The Publishing OS for Amazon KDP
          </div>

          <h1 className="mt-6 text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
            Build Your KDP Business
            <br />
            <span className="brand-gradient-text brand-gradient-text-bright">Faster Than Ever</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/50">
            Research profitable niches, generate books, create covers, package everything
            for Amazon KDP, and scale your publishing workflow from a single platform.
          </p>

          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              href="#pricing"
              className="rounded-lg btn-brand px-8 py-3 text-sm font-bold transition-opacity"
            >
              Buy Now — $17
            </Link>
            <Link
              href="#features"
              className="rounded-lg border border-white/20 px-8 py-3 text-sm font-medium text-white/70 hover:border-white/40 hover:text-white transition-colors"
            >
              Explore Features
            </Link>
          </div>

          {/* Workflow strip */}
          <div className="mt-14 flex items-center justify-center gap-2 text-xs text-white/30">
            {["Research", "Create", "Package", "Publish"].map((s, i, arr) => (
              <span key={s} className="flex items-center gap-2">
                <span className="font-semibold text-white/60">{s}</span>
                {i < arr.length - 1 && <span className="text-[#2563EB]">→</span>}
              </span>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" className="border-t border-white/10 bg-white/[0.02] px-8 py-20">
          <div className="mx-auto max-w-4xl">
            <p className="mb-10 text-center text-xs font-semibold uppercase tracking-widest text-[#2563EB]">
              Everything in one platform
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl border border-white/10 bg-white/5 p-5 transition-all hover:border-[#2563EB]/40 hover:bg-white/[0.08]"
                >
                  <div className="mb-2 h-1.5 w-6 rounded-full bg-[#2563EB]" />
                  <h2 className="font-semibold text-white">{f.title}</h2>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/40">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ── */}
        <section id="pricing" className="border-t border-white/10 px-8 py-24 text-center">
          <div className="mx-auto max-w-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[#2563EB]">
              Front End
            </p>
            <h2 className="text-3xl font-bold text-white">BookNexa</h2>
            <ul className="mt-6 space-y-2 text-sm text-white/60">
              {FRONT_END_FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-8 text-4xl font-bold text-[#2563EB]">$17</p>
            <p className="mt-1 text-xs text-white/30">one-time payment</p>
            <Link
              href={BUY_URL}
              className="mt-8 inline-block w-full rounded-lg btn-brand px-10 py-3.5 text-sm font-bold transition-opacity"
            >
              Buy Now
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 px-8 py-6 text-center text-xs text-white/20">
        BookNexa is an independent publishing software platform and is not affiliated with Amazon.
      </footer>

    </div>
  );
}
