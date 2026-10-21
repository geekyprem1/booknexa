import { NextRequest, NextResponse } from "next/server";
import { MAX_SLOT_LIMIT } from "@/lib/planner/core";
import { plannerUser, setSlotLimit } from "@/lib/planner/store";
import { badRequest, jsonBody, serverError } from "@/lib/shelves/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Slots per format per week: { weeklySlotLimit: 1–20 }. KDP's own limit is 2 per account. */
export async function POST(req: NextRequest) {
  const userId = await plannerUser("planner-settings", 10);
  if (userId instanceof Response) return userId;
  const body = await jsonBody(req);
  if (body instanceof Response) return body;

  const n = Number(body.weeklySlotLimit);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SLOT_LIMIT) return badRequest(`Slots per week must be 1–${MAX_SLOT_LIMIT}`);
  try {
    return NextResponse.json({ weeklySlotLimit: await setSlotLimit(userId, n) });
  } catch (e) {
    return serverError("planner settings", e);
  }
}
