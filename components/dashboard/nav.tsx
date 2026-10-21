"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  TrendingUp, Wand2, SquarePen, Factory, Bot, Image as ImageIcon, Sparkles, ListChecks,
  Grid3x3, Hash, Waypoints, Grid2x2, Shuffle, KeyRound, Spline, Palette, Layers, PenLine,
  Calculator, BookOpen, NotebookPen, Library, Download, CreditCard, LifeBuoy, Settings,
  Zap, ShieldCheck, LogOut, Gift, Users, Store, FlaskConical, Plus, ChevronDown, Menu, X, CalendarCheck,
  Coins, ArrowRight, PanelLeftClose, PanelLeftOpen, ChevronsUpDown, type LucideIcon,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Logo } from "@/components/brand/logo";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  type?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar sections, in the order a publisher works: make → shelve & publish → scale → library. */
const GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: BookOpen },
      { href: "/dashboard/niche", label: "Profit Radar™", icon: TrendingUp },
      { href: "/dashboard/create", label: "Book Studio", icon: SquarePen },
      { href: "/dashboard/cover-v2", label: "Cover Studio", icon: ImageIcon },
      { href: "/dashboard/in-progress", label: "Queue", icon: ListChecks },
      { href: "/dashboard/books", label: "Vault", icon: Library },
    ],
  },
  {
    label: "Shelf & Publish",
    items: [
      { href: "/dashboard/shelves", label: "Shelves", icon: Layers },
      { href: "/dashboard/planner", label: "Slot Planner", icon: CalendarCheck },
      { href: "/dashboard/royalty", label: "Royalty Calculator", icon: Calculator },
      { href: "/dashboard/title-optimizer", label: "Title Lab", icon: Wand2 },
    ],
  },
  {
    label: "Scale",
    items: [
      { href: "/dashboard/bundle", label: "Profit Factory™", icon: Factory },
      { href: "/dashboard/autopilot", label: "Autopilot", icon: Bot },
    ],
  },
  {
    label: "Library",
    items: [
      { href: "/dashboard/dfy", label: "DFY Library", icon: Gift },
      { href: "/dashboard/bonus-lab", label: "Bonus Lab", icon: FlaskConical },
      { href: "/dashboard/downloads", label: "Asset Vault", icon: Download },
    ],
  },
];

/** Book formats — the "New book" panel. Each opens the unified wizard preselected. */
const FORMAT_GROUPS: NavGroup[] = [
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

const COLLAPSE_KEY = "bn-sidebar-collapsed";

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-paper";

type Popover = null | "new" | "account";

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

  const [collapsed, setCollapsed] = useState(false);
  const [popover, setPopover] = useState<Popover>(null);
  const [drawer, setDrawer] = useState(false);
  const [drawerFormats, setDrawerFormats] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Remember the collapsed state between visits (desktop only).
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage blocked */
    }
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage blocked */
      }
      return !c;
    });

  // Close everything on navigation.
  useEffect(() => {
    setPopover(null);
    setDrawer(false);
  }, [pathname, params]);

  // Desktop popovers: Escape or a click outside the sidebar/flyout closes them.
  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPopover(null);
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (asideRef.current?.contains(t) || flyoutRef.current?.contains(t)) return;
      setPopover(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [popover]);

  // Mobile drawer: Escape closes, the page behind doesn't scroll, focus returns to the menu button.
  const closeDrawer = useCallback(() => {
    setDrawer(false);
    menuButtonRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [drawer, closeDrawer]);

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
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const formatActive = (g: NavItem) => pathname === g.href || activeType === g.type;

  // Story Book is an admin-only internal tool — hidden from everyone else.
  const formatGroups = FORMAT_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.type !== "story" || isAdmin) }));

  const addOns: NavItem[] = [
    ...(hasAgency ? [{ href: "/dashboard/agency", label: "Agency", icon: Users }] : []),
    ...(hasReseller ? [{ href: "/dashboard/reseller", label: "Reseller", icon: Store }] : []),
  ];
  const groups: NavGroup[] = addOns.length ? [...GROUPS, { label: "Add-ons", items: addOns }] : GROUPS;

  const initial = (email?.trim()?.[0] ?? "B").toUpperCase();
  const width = collapsed ? "lg:w-[76px]" : "lg:w-64";

  return (
    <>
      {/* ═══ Mobile top bar ═══ */}
      <header className="press-motion sticky top-0 z-40 flex h-14 items-center gap-2 border-b-2 border-ink bg-paper/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-paper/85 sm:px-5 lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => { setDrawerFormats(false); setDrawer(true); }}
          aria-expanded={drawer}
          aria-controls="nav-drawer"
          aria-label="Open menu"
          className={`flex h-10 w-10 items-center justify-center rounded-md border border-rule bg-paper-card text-ink ${FOCUS}`}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link href="/dashboard" className={`rounded-md ${FOCUS}`}>
          <Logo variant="light" className="h-8 text-[19px]" />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {credits !== null && <CreditsPill credits={credits} planName={planName} className="hidden sm:inline-flex" />}
          <button
            type="button"
            onClick={() => { setDrawerFormats(true); setDrawer(true); }}
            className={`btn-nexa inline-flex min-h-[40px] items-center gap-1.5 rounded-md border-2 border-ink px-3 text-sm font-semibold shadow-press-sm ${FOCUS}`}
          >
            <Plus className="h-4 w-4" aria-hidden /> New book
          </button>
        </div>
      </header>

      {/* ═══ Mobile drawer ═══ */}
      {drawer && (
        <div className="press-motion fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={closeDrawer} className="absolute inset-0 bg-ink/40" />
          <div
            id="nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-[min(320px,88vw)] flex-col border-r-2 border-ink bg-paper shadow-xl"
          >
            <div className="flex h-14 items-center justify-between border-b border-rule px-3">
              <Logo variant="light" className="h-8 text-[19px]" />
              <button
                type="button"
                autoFocus
                onClick={closeDrawer}
                aria-label="Close menu"
                className={`flex h-10 w-10 items-center justify-center rounded-md border border-rule bg-paper-card ${FOCUS}`}
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
              {credits !== null && <CreditsPill credits={credits} planName={planName} className="flex w-full justify-between" />}
              <div>
                <button
                  type="button"
                  onClick={() => setDrawerFormats((o) => !o)}
                  aria-expanded={drawerFormats}
                  aria-controls="drawer-formats"
                  className={`btn-nexa flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border-2 border-ink text-sm font-semibold shadow-press-sm ${FOCUS}`}
                >
                  <Plus className="h-4 w-4" aria-hidden /> New book
                  <ChevronDown className={`h-4 w-4 transition-transform ${drawerFormats ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {drawerFormats && (
                  <div id="drawer-formats" className="mt-3 space-y-4 rounded-lg border border-rule bg-paper-card p-3">
                    {formatGroups.map((g) => (
                      <NavSection key={g.label} group={g} isActive={(i) => formatActive(i)} collapsed={false} />
                    ))}
                  </div>
                )}
              </div>
              {groups.map((g) => (
                <NavSection key={g.label} group={g} isActive={(i) => isActive(i.href)} collapsed={false} />
              ))}
              <div className="border-t border-rule pt-4">
                <p className="px-3 font-ledger text-[11px] uppercase tracking-widest text-ink-muted">Account</p>
                {email && <p className="mt-1 truncate px-3 text-sm text-ink-soft">{email}</p>}
                <AccountLinks isAdmin={isAdmin} pathname={pathname} onSignOut={signOut} />
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* ═══ Desktop sidebar ═══ */}
      <aside
        ref={asideRef}
        aria-label="Sidebar"
        className={`press-motion sticky top-0 z-40 hidden h-screen shrink-0 flex-col border-r-2 border-ink bg-paper transition-[width] duration-200 lg:flex ${width}`}
      >
        {/* brand + collapse */}
        <div className={`flex h-16 items-center border-b border-rule ${collapsed ? "justify-center px-2" : "justify-between pl-4 pr-2"}`}>
          <Link href="/dashboard" className={`rounded-md ${FOCUS}`} aria-label="BookNexa overview">
            <Logo variant="light" showWordmark={!collapsed} className="h-9 text-[20px]" />
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className={`flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-paper-deep hover:text-ink ${FOCUS}`}
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        {/* new book */}
        <div className={collapsed ? "px-2 pt-4" : "px-3 pt-4"}>
          <button
            type="button"
            onClick={() => setPopover((p) => (p === "new" ? null : "new"))}
            aria-expanded={popover === "new"}
            aria-controls="nav-new"
            aria-label={collapsed ? "New book" : undefined}
            title={collapsed ? "New book" : undefined}
            className={`btn-nexa flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md border-2 border-ink text-sm font-semibold shadow-press-sm transition-all active:translate-x-[2px] active:translate-y-[2px] active:shadow-none ${FOCUS}`}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {!collapsed && (
              <>
                New book
                <ArrowRight className={`ml-auto mr-1 h-4 w-4 transition-transform ${popover === "new" ? "translate-x-0.5" : ""}`} aria-hidden />
              </>
            )}
          </button>
        </div>

        {/* sections */}
        <nav aria-label="Main" className={`mt-4 flex-1 space-y-4 overflow-y-auto pb-4 ${collapsed ? "px-2" : "px-3"}`}>
          {groups.map((g, i) => (
            <NavSection key={g.label} group={g} isActive={(it) => isActive(it.href)} collapsed={collapsed} divider={i > 0} />
          ))}
        </nav>

        {/* footer: credits + account */}
        <div className={`relative border-t border-rule ${collapsed ? "space-y-2 px-2 py-3" : "space-y-2 px-3 py-3"}`}>
          {collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className={`flex h-10 w-full items-center justify-center rounded-md text-ink-muted hover:bg-paper-deep hover:text-ink ${FOCUS}`}
            >
              <PanelLeftOpen className="h-4 w-4" aria-hidden />
            </button>
          ) : (
            credits !== null && <CreditsPill credits={credits} planName={planName} className="flex w-full justify-between" />
          )}
          <button
            type="button"
            onClick={() => setPopover((p) => (p === "account" ? null : "account"))}
            aria-expanded={popover === "account"}
            aria-controls="nav-account"
            aria-label="Account menu"
            className={`flex w-full items-center gap-3 rounded-md p-1.5 text-left hover:bg-paper-deep ${collapsed ? "justify-center" : ""} ${FOCUS}`}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper-card font-display text-base font-bold text-ink">
              {initial}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{email ?? "Account"}</span>
                  {planName && <span className="block truncate font-ledger text-[11px] uppercase tracking-wider text-ink-muted">{planName}</span>}
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
              </>
            )}
          </button>

          {popover === "account" && (
            <div
              id="nav-account"
              className={`absolute z-50 rounded-lg border-2 border-ink bg-paper-card p-2 shadow-xl ${collapsed ? "bottom-3 left-full ml-2 w-72" : "bottom-full left-3 right-3 mb-2"}`}
            >
              {collapsed && (
                <div className="border-b border-rule px-3 pb-2 pt-1">
                  {email && <p className="truncate text-sm font-medium text-ink">{email}</p>}
                  {planName && <p className="font-ledger text-xs uppercase tracking-wider text-ink-muted">{planName}</p>}
                  {credits !== null && <p className="mt-0.5 font-ledger text-xs text-ink-soft">{credits.toLocaleString()} credits</p>}
                </div>
              )}
              <AccountLinks isAdmin={isAdmin} pathname={pathname} onSignOut={signOut} />
            </div>
          )}
        </div>
      </aside>

      {/* ═══ "New book" flyout (desktop): every format, grouped like a table of contents ═══ */}
      {popover === "new" && (
        <div
          ref={flyoutRef}
          id="nav-new"
          className={`press-motion fixed inset-y-0 z-30 hidden w-[min(760px,calc(100vw-16rem))] overflow-y-auto border-r-2 border-ink bg-paper-card shadow-2xl lg:block ${collapsed ? "left-[76px]" : "left-64"}`}
        >
          <div className="flex h-16 items-center justify-between border-b border-rule px-6">
            <p className="font-display text-xl font-bold text-ink">Start a new book</p>
            <button
              type="button"
              onClick={() => setPopover(null)}
              aria-label="Close"
              className={`flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-paper-deep hover:text-ink ${FOCUS}`}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="grid gap-8 p-6 sm:grid-cols-2 xl:grid-cols-3">
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
          </div>
          <div className="px-6 pb-6">
            <div className="relative overflow-hidden rounded-lg border-2 border-ink bg-ink p-5 text-paper">
              <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-nexa-violet/40 blur-2xl" />
              <span aria-hidden className="pointer-events-none absolute -bottom-14 -left-8 h-32 w-32 rounded-full bg-nexa-cyan/25 blur-2xl" />
              <p className="relative font-ledger text-xs uppercase tracking-widest text-marker">Not sure yet?</p>
              <p className="relative mt-2 font-display text-xl font-bold leading-snug">Let the data pick your next book.</p>
              <p className="relative mt-2 max-w-md text-sm text-paper/75">Profit Radar™ scores niches for demand and competition before you spend a credit.</p>
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
    </>
  );
}

function CreditsPill({ credits, planName, className = "" }: { credits: number; planName: string | null; className?: string }) {
  return (
    <Link
      href="/dashboard/billing"
      title={planName ?? undefined}
      className={`items-center gap-2 rounded-md border border-rule bg-paper-card px-3 py-2 font-ledger text-xs text-ink-soft transition-colors hover:border-ink ${FOCUS} ${className}`}
    >
      <span className="inline-flex items-center gap-2">
        <Coins className="h-3.5 w-3.5" aria-hidden />
        <span>
          <span className="font-semibold text-ink">{credits.toLocaleString()}</span> credits
        </span>
      </span>
    </Link>
  );
}

function NavSection({
  group,
  isActive,
  collapsed,
  divider = false,
}: {
  group: NavGroup;
  isActive: (item: NavItem) => boolean;
  collapsed: boolean;
  divider?: boolean;
}) {
  return (
    <div>
      {collapsed ? (
        divider && <div aria-hidden className="mx-2 mb-2 border-t border-rule" />
      ) : (
        <p className="mb-1 px-3 font-ledger text-[11px] uppercase tracking-widest text-ink-muted">{group.label}</p>
      )}
      <ul className="space-y-0.5">
        {group.items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                className={`relative flex min-h-9 items-center gap-3 rounded-md text-sm transition-colors ${collapsed ? "justify-center px-0" : "px-3"} ${
                  active ? "bg-marker-soft font-semibold text-ink" : "text-ink-soft hover:bg-paper-deep hover:text-ink"
                } ${FOCUS}`}
              >
                {active && <span aria-hidden className="nexa-bar-v absolute inset-y-1.5 left-0 w-1 rounded-r" />}
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {!collapsed && <span className="truncate">{item.label}</span>}
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
