import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAdmin } from "@/lib/admin";
import { getOrCreateSubscription } from "@/lib/billing";
import { DashboardNav } from "@/components/dashboard/nav";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

export const dynamic = "force-dynamic";

// "Press" identity type stack: editorial serif headlines, neutral UI sans,
// monospace for ledgers / labels / numbers.
const displayFont = Playfair_Display({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["600", "700", "800"] });
const uiFont = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const ledgerFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-ledger", display: "swap", weight: ["400", "500", "600"] });
const FONT_VARS = `${displayFont.variable} ${uiFont.variable} ${ledgerFont.variable}`;

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  suspended: { title: "Your account is suspended", body: "Access to BookNexa is temporarily paused. Contact support if you believe this is a mistake." },
  banned: { title: "Your account has been banned", body: "Access to BookNexa has been revoked. Contact support if you believe this is a mistake." },
  deleted: { title: "Your account has been closed", body: "This account is no longer active." },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) redirect("/login");
    email = user.email ?? null;
    userId = user.id;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("account_status")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError || !profile) redirect("/login?error=account_unavailable");
    const status = profile.account_status as string;

    if (status !== "active") {
      const copy = STATUS_COPY[status] ?? STATUS_COPY.banned;
      return (
        <div className={`${FONT_VARS} paper-grain flex min-h-screen flex-col items-center justify-center px-6 text-center font-ui`}>
          <h1 className="font-display text-3xl font-bold text-ink">{copy.title}</h1>
          <p className="mt-2 max-w-md text-sm text-ink-soft">{copy.body}</p>
          <SignOutButton className="btn-nexa mt-6 min-h-[44px] rounded-md border-2 border-ink px-5 text-sm font-semibold shadow-press-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2" />
        </div>
      );
    }
  } catch {
    redirect("/login");
  }

  const admin = await resolveAdmin();

  // Manually-fulfilled add-ons (Agency/Reseller) surface in the sidebar only when
  // the buyer actually owns the entitlement.
  let hasAgency = false;
  let hasReseller = false;
  let credits: number | null = null;
  let planName: string | null = null;
  if (userId) {
    try {
      const sub = await getOrCreateSubscription(userId);
      hasAgency = sub.entitlements?.agency === true;
      hasReseller = Boolean(sub.entitlements?.reseller);
      credits = sub.credits_remaining;
      planName = sub.plan_name;
    } catch {
      /* non-fatal: nav just won't show the add-on links / credit pill */
    }
  }

  return (
    <div className={`${FONT_VARS} paper-grain flex min-h-screen flex-col font-ui text-ink`}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-sm font-medium text-paper focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <Suspense fallback={<div className="h-16 border-b-2 border-ink bg-paper" />}>
        <DashboardNav
          email={email}
          isAdmin={Boolean(admin)}
          hasAgency={hasAgency}
          hasReseller={hasReseller}
          credits={credits}
          planName={planName}
        />
      </Suspense>
      <main id="main" className="press-forms mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}
