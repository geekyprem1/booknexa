/** Shared route plumbing for the Shelf Suite API. */

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "../supabase/server";
import { rateLimit, rateLimitResponse } from "../util/rate-limit";
import { assertFeature, billingErrorResponse } from "../billing/guard";

export type RouteUser = { id: string };

/** Auth + rate limit + the `shelves` feature gate. Returns the user or a response. */
export async function shelfRouteUser(key: string, limit = 30): Promise<RouteUser | Response> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const rl = rateLimit(`${key}:${user.id}`, limit);
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec);
  try {
    await assertFeature(user.id, "shelves");
  } catch (e) {
    const r = billingErrorResponse(e);
    if (r) return r;
    throw e;
  }
  return { id: user.id };
}

/** Parse a JSON object body, or return a 400 response. */
export async function jsonBody(req: NextRequest): Promise<Record<string, unknown> | Response> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
}

export const notFound = (what: string) => NextResponse.json({ error: `${what} not found` }, { status: 404 });
export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });

export function serverError(context: string, err: unknown) {
  console.error(`[shelves] ${context}:`, err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
