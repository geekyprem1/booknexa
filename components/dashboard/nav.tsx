"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  TrendingUp, Wand2, SquarePen, Factory, Bot, Image as ImageIcon, Sparkles, ListChecks,
  Grid3x3, Hash, Waypoints, Grid2x2, Shuffle, KeyRound, Spline, Palette, Layers, PenLine,
  Calculator, BookOpen, NotebookPen, Library, Download, CreditCard, LifeBuoy, Settings,
  Zap, ShieldCheck, LogOut, Gift, Users, Store, FlaskConical, Plus, ChevronDown, Menu, X,
  Coins, ArrowRight, type LucideIcon,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/logo";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  type?: string;
  desc?: string;
}

/** Always-visible primary destinations in the top bar. */
const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: BookOpen },
  { href: "/dashboard/niche", label: "Profit Radar™", icon: TrendingUp },
  { href: "/dashboard/create", label: "Book Studio", icon: SquarePen },
  { href: "/dashboard/cover-v2", label: "Cover Studio", icon: ImageIcon },
  { href: "/dashboard/in-progress", label: "Queue", icon: ListChecks },
  { href: "/dashboard/books", label: "Vault", icon: Library },
];

/** Secondary tools, grouped under "More". */
const MORE: NavItem[] = [
  { href: "/dashboard/title-optimizer", label: "Title Lab", icon: Wand2, desc: "Search-optimized titles & subtitles" },
  { href: "/dashboard/bundle", label: "Profit Factory™", icon: Factory, desc: "Produce a whole series in one run" },
  { href: "/dashboard/autopilot", label: "Autopilot", icon: Bot, desc: "Hands-off planning & production" },
  { href: "/dashboard/dfy", label: "DFY Library", icon: Gift, desc: "Done-for-you books & assets" },
  { href: "/dashboard/bonus-lab", label: "Bonus Lab", icon: FlaskConical, desc: "Extra tools & experiments" },
  { href: "/dashboard/downloads", label: "Asset Vault", icon: Download, desc: "Every file you've exported" },
];

/** Book formats — the "New book" panel. Each opens the unified wizard preselected. */
const FORMAT_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Puzzle Books",
    items: [
      { href: "/dashboard/word-search", label: "Word Search", type: "word-search", icon: Grid3x3 },
      { href: "/dashboard/sudoku", label: "Sudoku", type: "sudoku", icon: Hash },
      { href: "/dashboard/maze", label: "Maze", type: "maze", icon: Waypoints },
      { href: "/dashboard/crossword", label: "Crossword", type: "crossword", icon: Grid2x2 },
      { href: "/dashboard/scramble", label: "Word Scramble", type: "scramble", icon: Shuffle },
      { href: "/dashboard/cryptogram", label: "Cryptogram", type: "cryptogram", icon: KeyRound },
      { href: "/dashboard/dot-to-dot", label: "Connect the Dots", type: "dot_to_dot", icon: Spline },
    ],
  },
  {
    label: "Kids & Learning",
    items: [
      { href: "/dashboard/coloring", label: "Coloring Book", type: "coloring", icon: Palette },
      { href: "/dashboard/activity", label: "Activity Book", type: "activity", icon: Layers },
      { href: "/dashboard/tracing", label: "Tracing Workbook", type: "tracing", icon: PenLine },
      { href: "/dashboard/math", label: "Math Workbook", type: "math", icon: Calculator },
      { href: "/dashboard/story", label: "Story Book", type: "story", icon: Sparkles },
    ],
  },
  {
    label: "Low-Content & Text",
    items: [
      { href: "/dashboard/lowcontent", label: "Journals & Planners", type: "lowcontent", icon: NotebookPen },
      { href: "/dashboard/ebook-creator", label: "Ebook Creator", type: "ebook", icon: BookOpen },
    ],
  },
];

const ACCOUNT: NavItem[] = [
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
  { href: "/dashboard/support", label: "Support", icon: LifeBuoy },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

type Panel = null | "new" | "more" | "account" | "mobile";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

/** The BookNexa lockup — logo mark + navy "book" / gradient "nexa". */
function Wordmark() {
  return <Logo variant="light" className="h-9 text-[21px] sm:h-10" />;
}

export function DashboardNav({
  email,
  isAdmin = false,
  hasAgency = false,
  hasReseller = false,
  credits = null,
  planName = null,
}: {
  email?: string | null;
  isAdmin?: boolean;
  hasAgency?: boolean;
  hasReseller?: boolean;
  credits?: number | null;
  planName?: string | null;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const activeType = pathname === "/dashboard/create" ? params.get("type") : null;
  const [open, setOpen] = useState<Panel>(null);
  const headerRef = useRef<HTMLElement>(null);

  // Close any open panel on navigation, Escape, or a click outside the header.
  useEffect(() => setOpen(null), [pathname, params]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const toggle = (p: Exclude<Panel, null>) => setOpen((cur) => (cur === p ? null : p));

  async function signOut() {
    try {
      await createSupabaseBrowserClient().auth.signOut();
    } catch {
      /* ignore */
    }
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/create") return pathname === "/dashboard/create" && !activeType;
    return pathname.startsWith(href);
  };
  const formatActive = (g: NavItem) => pathname === g.href || activeType === g.type;
  const moreActive = MORE.some((m) => pathname.startsWith(m.href));

  // Story Book is an admin-only internal tool — hidden from everyone else.
  const formatGroups = FORMAT_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.type !== "story" || isAdmin),
  }));

  const addOns: NavItem[] = [
    ...(hasAgency ? [{ href: "/dashboard/agency", label: "Agency", icon: Users, desc: "Client projects & seats" }] : []),
    ...(hasReseller ? [{ href: "/dashboard/reseller", label: "Reseller", icon: Store, desc: "Sell BookNexa access" }] : []),
  ];

  const initial = (email?.trim()?.[0] ?? "B").toUpperCase();

  return (
    <header ref={headerRef} className="press-motion sticky top-0 z-40 border-b-2 border-ink bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <Link href="/dashboard" className={`shrink-0 rounded-md ${FOCUS}`}>
          <Wordmark />
        </Link>

        {/* ── Primary nav (desktop) ── */}
        <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
          {PRIMARY.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                  active ? "text-ink" : "text-ink-muted hover:bg-paper-deep hover:text-ink"
                } ${FOCUS}`}
              >
                {item.label}
                {active && <span aria-hidden className="nexa-bar absolute inset-x-3 -bottom-[13px] h-1 rounded-t" />}
              </Link>
            );
          })}
          <div className="relative">
            <button
              type="button"
              onClick={() => toggle("more")}
              aria-expanded={open === "more"}
              aria-controls="nav-more"
              className={`relative inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                moreActive || open === "more" ? "text-ink" : "text-ink-muted hover:bg-paper-deep hover:text-ink"
              } ${FOCUS}`}
            >
              More <ChevronDown className={`h-4 w-4 transition-transform ${open === "more" ? "rotate-180" : ""}`} aria-hidden />
              {moreActive && <span aria-hidden className="nexa-bar absolute inset-x-3 -bottom-[13px] h-1 rounded-t" />}
            </button>

            {/* ── "More" dropdown ── */}
            {open === "more" && (
              <div id="nav-more" className="absolute left-0 top-full mt-[14px] w-[380px] rounded-b-lg border-2 border-t-0 border-ink bg-paper-card p-2 shadow-xl">
                <ul className="grid grid-cols-1 gap-0.5">
                  {[...MORE, ...addOns].map((item) => {
                    const Icon = item.icon;
                    const active = pathname.startsWith(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors ${active ? "bg-marker-soft" : "hover:bg-paper-deep"} ${FOCUS}`}
                        >
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />
                          <span>
                            <span className="block text-sm font-semibold text-ink">{item.label}</span>
                            {item.desc && <span className="block text-xs text-ink-muted">{item.desc}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {credits !== null && (
            <Link
              href="/dashboard/billing"
              className={`hidden items-center gap-2 rounded-md border border-rule bg-paper-card px-3 py-1.5 font-ledger text-xs text-ink-soft transition-colors hover:border-ink sm:inline-flex ${FOCUS}`}
              title={planName ?? undefined}
            >
              <Coins className="h-3.5 w-3.5" aria-hidden />
              <span className="font-semibold text-ink">{credits.toLocaleString()}</span> credits
            </Link>
          )}

          <button
            type="button"
            onClick={() => toggle("new")}
            aria-expanded={open === "new"}
            aria-controls="nav-new"
            className={`btn-nexa inline-flex min-h-[40px] items-center gap-1.5 rounded-md border-2 border-ink px-3.5 text-sm font-semibold shadow-press-sm transition-all duration-150 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${FOCUS}`}
          >
            <Plus className="h-4 w-4" aria-hidden /> New book
          </button>

          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => toggle("account")}
              aria-expanded={open === "account"}
              aria-controls="nav-account"
              aria-label="Account menu"
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-paper-card font-display text-base font-bold text-ink transition-colors hover:bg-paper-deep ${FOCUS}`}
            >
              {initial}
            </button>

            {/* ── Account dropdown ── */}
            {open === "account" && (
              <div id="nav-account" className="absolute right-0 top-full mt-[12px] w-72 rounded-b-lg border-2 border-t-0 border-ink bg-paper-card p-2 shadow-xl">
                <div className="border-b border-rule px-3 pb-3 pt-2">
                  {email && <p className="truncate text-sm font-medium text-ink">{email}</p>}
                  {planName && <p className="mt-0.5 font-ledger text-xs uppercase tracking-wider text-ink-muted">{planName}</p>}
                </div>
                <AccountLinks isAdmin={isAdmin} pathname={pathname} onSignOut={signOut} />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => toggle("mobile")}
            aria-expanded={open === "mobile"}
            aria-controls="nav-mobile"
            aria-label={open === "mobile" ? "Close menu" : "Open menu"}
            className={`flex h-10 w-10 items-center justify-center rounded-md border border-rule bg-paper-card text-ink lg:hidden ${FOCUS}`}
          >
            {open === "mobile" ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      {/* ── "New book" panel: every format, grouped like a table of contents ── */}
      {open === "new" && (
        <div id="nav-new" className="absolute inset-x-0 top-full border-b-2 border-ink bg-paper-card shadow-xl">
          <div className="mx-auto grid max-w-[1360px] gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_1fr_1fr_280px] lg:px-10">
            {formatGroups.map((group) => (
              <div key={group.label}>
                <p className="font-ledger text-xs font-medium uppercase tracking-widest text-ink-muted">{group.label}</p>
                <ul className="mt-3 space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = formatActive(item);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={`group flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors ${
                            active ? "bg-marker-soft font-semibold text-ink" : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                          } ${FOCUS}`}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="whitespace-nowrap">{item.label}</span>
                          <span aria-hidden className="toc-leader opacity-0 transition-opacity group-hover:opacity-100" />
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <div className="relative overflow-hidden rounded-lg border-2 border-ink bg-ink p-5 text-paper">
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-nexa-violet/40 blur-2xl" />
              <span aria-hidden className="pointer-events-none absolute -bottom-14 -left-8 h-32 w-32 rounded-full bg-nexa-cyan/25 blur-2xl" />
              <p className="relative font-ledger text-xs uppercase tracking-widest text-marker">Not sure yet?</p>
              <p className="relative mt-2 font-display text-xl font-bold leading-snug">Let the data pick your next book.</p>
              <p className="relative mt-2 text-sm text-paper/75">Profit Radar™ scores niches for demand and competition before you spend a credit.</p>
              <Link
                href="/dashboard/niche"
                className="relative mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-md bg-marker px-4 text-sm font-semibold text-ink transition-colors hover:bg-marker-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marker focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                Open Profit Radar™ <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile sheet ── */}
      {open === "mobile" && (
        <div id="nav-mobile" className="absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b-2 border-ink bg-paper-card shadow-xl lg:hidden">
          <nav aria-label="Mobile" className="space-y-6 px-4 py-5 sm:px-6">
            {credits !== null && (
              <Link href="/dashboard/billing" className={`flex items-center justify-between rounded-md border border-rule px-3 py-2.5 ${FOCUS}`}>
                <span className="font-ledger text-xs uppercase tracking-wider text-ink-muted">{planName ?? "Credits"}</span>
                <span className="font-ledger text-sm font-semibold text-ink">{credits.toLocaleString()} credits</span>
              </Link>
            )}
            <MobileGroup title="Workspace" items={PRIMARY} isActive={isActive} />
            <MobileGroup title="Tools" items={[...MORE, ...addOns]} isActive={(h) => pathname.startsWith(h)} />
            {formatGroups.map((g) => (
              <MobileGroup key={g.label} title={g.label} items={g.items} isActive={(_, item) => formatActive(item)} />
            ))}
            <div>
              <p className="font-ledger text-xs uppercase tracking-widest text-ink-muted">Account</p>
              {email && <p className="mt-2 truncate px-3 text-sm text-ink-soft">{email}</p>}
              <AccountLinks isAdmin={isAdmin} pathname={pathname} onSignOut={signOut} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

function MobileGroup({
  title,
  items,
  isActive,
}: {
  title: string;
  items: NavItem[];
  isActive: (href: string, item: NavItem) => boolean;
}) {
  return (
    <div>
      <p className="font-ledger text-xs uppercase tracking-widest text-ink-muted">{title}</p>
      <ul className="mt-2 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[44px] items-center gap-3 rounded-md px-3 text-sm ${
                  active ? "bg-marker-soft font-semibold text-ink" : "text-ink-soft hover:bg-paper-deep"
                } ${FOCUS}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AccountLinks({
  isAdmin,
  pathname,
  onSignOut,
}: {
  isAdmin: boolean;
  pathname: string;
  onSignOut: () => void;
}) {
  const row = `flex min-h-[44px] w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors ${FOCUS}`;
  return (
    <ul className="mt-1 space-y-0.5">
      <li>
        <Link href="/dashboard/upgrade" className={`${row} font-semibold text-ink hover:bg-marker-soft`}>
          <Zap className="h-4 w-4 text-nexa-violet" aria-hidden /> <span className="brand-gradient-text">Upgrade &amp; Add-ons</span>
        </Link>
      </li>
      {ACCOUNT.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`${row} ${active ? "bg-paper-deep font-medium text-ink" : "text-ink-soft hover:bg-paper-deep hover:text-ink"}`}
            >
              <Icon className="h-4 w-4" aria-hidden /> {item.label}
            </Link>
          </li>
        );
      })}
      {isAdmin && (
        <li>
          <Link href="/admin" className={`${row} font-semibold text-forest hover:bg-forest-soft`}>
            <ShieldCheck className="h-4 w-4" aria-hidden /> Admin Control
          </Link>
        </li>
      )}
      <li className="border-t border-rule pt-1">
        <button type="button" onClick={onSignOut} className={`${row} text-ink-soft hover:bg-clay-soft hover:text-clay`}>
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </li>
    </ul>
  );
}
