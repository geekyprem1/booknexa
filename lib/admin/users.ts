/**
 * Admin user management. Reuses the existing billing/credits system for all
 * money/credit movement (atomic RPCs) and only adds account-status flags on
 * profiles. Every mutating call records an admin_audit_log entry.
 */

import { getSupabaseAdminClient } from "../supabase/admin";
import { PersistenceError, PersistenceNotFoundError, requireMutationRow } from "../supabase/errors";
import { changePlan, applyOfferMeta, getOrCreateSubscription } from "../billing/subscription";
import { grant, removeCredits, refund } from "../billing/credits";
import type { PlanKey } from "../billing/plans";
import { grantableByKey, grantables } from "../offers";
import { logAdminAction } from "./audit";
import type { AdminIdentity, AccountStatus, Role } from "./roles";

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  account_status: string;
  created_at: string;
  plan_name: string | null;
  plan_type: string | null;
  credits_remaining: number | null;
  sub_status: string | null;
  granted_offers: Array<{ key: string; label: string; count: number }> | null;
}

interface SubEmbed {
  plan_name: string;
  plan_type: string;
  credits_remaining: number;
  status: string;
  entitlements?: Record<string, boolean | string>;
}

/** Use the delivery log, since several offers can grant the same feature flags. */
async function grantedOffersForUsers(userIds: string[]): Promise<Map<string, NonNullable<AdminUserRow["granted_offers"]>> | null> {
  const grouped = new Map<string, NonNullable<AdminUserRow["granted_offers"]>>();
  if (userIds.length === 0) return grouped;
  const labels = new Map(grantables().map((offer) => [offer.key, offer.label]));
  const admin = getSupabaseAdminClient();
  const pageSize = 500;

  // Page through the log so older grants are still included for busy accounts.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.from("admin_audit_log")
      .select("target_id, detail")
      .eq("action", "grant_offer")
      .eq("target_type", "user")
      .in("target_id", userIds)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error("[admin] granted offers lookup failed:", error);
      return null;
    }
    for (const row of data ?? []) {
      const detail = row.detail as { offer?: unknown } | null;
      if (!row.target_id || typeof detail?.offer !== "string") continue;
      const offers = grouped.get(row.target_id) ?? [];
      const existing = offers.find((offer) => offer.key === detail.offer);
      if (existing) existing.count += 1;
      else offers.push({ key: detail.offer, label: labels.get(detail.offer) ?? detail.offer, count: 1 });
      grouped.set(row.target_id, offers);
    }
    if (!data || data.length < pageSize) break;
  }
  return grouped;
}

/** List users with their subscription, newest first. Optional search/status filter. */
export async function listUsers(opts: { search?: string; status?: string; limit?: number } = {}): Promise<AdminUserRow[]> {
  const admin = getSupabaseAdminClient();
  let q = admin
    .from("profiles")
    .select("id, email, full_name, role, account_status, created_at, subscriptions(plan_name, plan_type, credits_remaining, status)")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);

  if (opts.search?.trim()) q = q.ilike("email", `%${opts.search.trim()}%`);
  if (opts.status?.trim()) q = q.eq("account_status", opts.status.trim());

  const { data } = await q;
  const grantedOffers = await grantedOffersForUsers((data ?? []).map((row) => row.id));
  return ((data ?? []) as unknown as Array<Record<string, unknown> & { subscriptions: SubEmbed[] | SubEmbed | null }>).map((r) => {
    const sub = Array.isArray(r.subscriptions) ? r.subscriptions[0] : r.subscriptions;
    return {
      id: r.id as string,
      email: r.email as string,
      full_name: (r.full_name as string) ?? null,
      role: (r.role as string) ?? "user",
      account_status: (r.account_status as string) ?? "active",
      created_at: r.created_at as string,
      plan_name: sub?.plan_name ?? null,
      plan_type: sub?.plan_type ?? null,
      credits_remaining: sub?.credits_remaining ?? null,
      sub_status: sub?.status ?? null,
      granted_offers: grantedOffers ? grantedOffers.get(r.id as string) ?? [] : null,
    };
  });
}

export interface AdminUserDetail {
  profile: { id: string; email: string; full_name: string | null; role: string; account_status: string; status_reason: string | null; created_at: string };
  subscription: SubEmbed | null;
  bookCount: number;
  jobCount: number;
  recentBooks: Array<{ id: string; title: string; book_type: string; status: string; created_at: string }>;
  recentUsage: Array<{ id: string; action: string; credits: number; status: string; created_at: string }>;
  recentBilling: Array<{ id: string; action: string; detail: unknown; created_at: string }>;
  tickets: Array<{ id: string; subject: string; status: string; priority: string; created_at: string }>;
}

/** Full read-only "view-as" detail for one user. */
export async function getUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, email, full_name, role, account_status, status_reason, created_at")
    .eq("id", userId)
    .single();
  if (!profile) return null;

  const [
    { data: sub },
    { count: bookCount },
    { count: jobCount },
    { data: recentBooks },
    { data: recentUsage },
    { data: recentBilling },
    { data: tickets },
  ] = await Promise.all([
    admin.from("subscriptions").select("plan_name, plan_type, credits_remaining, status, entitlements").eq("user_id", userId).single(),
    admin.from("books").select("*", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("generation_jobs").select("*", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("books").select("id, title, book_type, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    admin.from("usage_events").select("id, action, credits, status, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
    admin.from("billing_audit_log").select("id, action, detail, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15),
    admin.from("support_tickets").select("id, subject, status, priority, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
  ]);

  return {
    profile: profile as AdminUserDetail["profile"],
    subscription: (sub as SubEmbed) ?? null,
    bookCount: bookCount ?? 0,
    jobCount: jobCount ?? 0,
    recentBooks: (recentBooks ?? []) as AdminUserDetail["recentBooks"],
    recentUsage: (recentUsage ?? []) as AdminUserDetail["recentUsage"],
    recentBilling: (recentBilling ?? []) as AdminUserDetail["recentBilling"],
    tickets: (tickets ?? []) as AdminUserDetail["tickets"],
  };
}

// ── Create a user (admin-provisioned account) ──

export interface CreateUserInput {
  email: string;
  password: string;
  fullName?: string;
  /** Elevated role to assign. Defaults to a normal "user". */
  role?: Role;
  /**
   * Offer to deliver on creation. Defaults to the Front End ("commercial"), so a
   * freshly created user starts on the FE plan. Pass "none" to skip and leave the
   * user on the Free Trial subscription.
   */
  offerKey?: string;
}

/**
 * Provision a new user from the admin panel. Creates the auth user (email
 * pre-confirmed so they can sign in immediately), lets the DB trigger seed the
 * profile row, optionally elevates the role, and delivers an offer — defaulting
 * to the Front End so the new account lands on the FE plan. Fully audited.
 *
 * Only a super_admin may create an admin/super_admin account; enforced at the route.
 */
export async function adminCreateUser(actor: AdminIdentity, input: CreateUserInput): Promise<{ id: string; email: string }> {
  const admin = getSupabaseAdminClient();
  const email = input.email.trim().toLowerCase();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: input.fullName?.trim() ? { full_name: input.fullName.trim() } : undefined,
  });
  if (error || !data.user) throw new PersistenceError("Create user", error ?? { message: "createUser returned no user" });
  const userId = data.user.id;

  // The on_auth_user_created trigger seeds public.profiles synchronously.
  if (input.role && input.role !== "user") {
    await admin.from("profiles").update({ role: input.role }).eq("id", userId);
  }

  // Deliver the Front End by default (or the chosen offer); "none" leaves them on Free Trial.
  const offerKey = input.offerKey ?? "commercial";
  if (offerKey && offerKey !== "none") {
    await adminGrantOffer(actor, userId, offerKey);
  } else {
    await getOrCreateSubscription(userId);
  }

  await logAdminAction(actor, "create_user", {
    targetType: "user",
    targetId: userId,
    detail: { email, role: input.role ?? "user", offerKey },
  });
  return { id: userId, email };
}

// ── Account status (suspend / ban / soft-delete / restore) ──

async function setStatus(actor: AdminIdentity, userId: string, status: AccountStatus, reason: string | undefined, action: Parameters<typeof logAdminAction>[1]): Promise<void> {
  const result = await getSupabaseAdminClient()
    .from("profiles")
    .update({ account_status: status, status_reason: reason ?? null, status_changed_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  requireMutationRow(result, "Update account status", "User");
  await logAdminAction(actor, action, { targetType: "user", targetId: userId, detail: { status, reason } });
}

export const suspendUser = (actor: AdminIdentity, userId: string, reason?: string) => setStatus(actor, userId, "suspended", reason, "suspend");
export const banUser = (actor: AdminIdentity, userId: string, reason?: string) => setStatus(actor, userId, "banned", reason, "ban");
export const softDeleteUser = (actor: AdminIdentity, userId: string, reason?: string) => setStatus(actor, userId, "deleted", reason, "soft_delete");
export const restoreUser = (actor: AdminIdentity, userId: string) => setStatus(actor, userId, "active", undefined, "restore_user");

/** Hard delete (super_admin only — enforced at the route). Cascades via auth.users FK. */
export async function hardDeleteUser(actor: AdminIdentity, userId: string): Promise<void> {
  const { data, error } = await getSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error) throw new PersistenceError("Hard delete user", error);
  if (!data.user) throw new PersistenceNotFoundError("User");
  await logAdminAction(actor, "hard_delete", { targetType: "user", targetId: userId });
}

// ── Credits / plan (reuse billing) ──

export async function adminGrantCredits(actor: AdminIdentity, userId: string, amount: number, reason = "admin_grant"): Promise<void> {
  await grant(userId, amount, reason);
  await logAdminAction(actor, "grant_credits", { targetType: "user", targetId: userId, detail: { amount, reason } });
}

export async function adminRemoveCredits(actor: AdminIdentity, userId: string, amount: number, reason = "admin_adjust"): Promise<void> {
  await removeCredits(userId, amount, reason);
  await logAdminAction(actor, "remove_credits", { targetType: "user", targetId: userId, detail: { amount, reason } });
}

export async function adminRefund(actor: AdminIdentity, userId: string, amount: number, note?: string): Promise<void> {
  await refund(userId, amount, note);
  await logAdminAction(actor, "refund", { targetType: "user", targetId: userId, detail: { amount, note } });
}

export async function adminChangePlan(actor: AdminIdentity, userId: string, planKey: PlanKey): Promise<void> {
  await changePlan(userId, planKey, { provider: "admin" });
  await logAdminAction(actor, "change_plan", { targetType: "user", targetId: userId, detail: { planKey } });
}

/**
 * Deliver a JVZoo offer to a buyer in one step: merge its entitlements, set the
 * base plan if the offer defines one, then grant its credits. This is how a
 * launchpadjv sale is fulfilled manually — pick the offer, the buyer gets
 * exactly what that offer includes.
 */
export async function adminGrantOffer(actor: AdminIdentity, userId: string, offerKey: string): Promise<void> {
  const g = grantableByKey(offerKey);
  if (!g) throw new Error("Unknown offer");
  await applyOfferMeta(userId, { plan: g.plan, entitlements: g.entitlements });
  if (g.credits > 0) await grant(userId, g.credits, `offer:${g.key}`);
  await logAdminAction(actor, "grant_offer", {
    targetType: "user",
    targetId: userId,
    detail: { offer: g.key, credits: g.credits, plan: g.plan ?? null, entitlements: g.entitlements },
  });
}
