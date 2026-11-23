import { db } from "@/lib/db";

// Parse rate limit (SPEC.md US-7, decision log 2026-11-23): 20 counted
// requests per user per rolling 24 hours, one RateLimitEvent row each. The key
// is always the userId from the caller's session, never from the request.
// Moves to src/lib in M7, when sign-in and sign-up use the same table.

const ACTION = "parse";
export const PARSE_LIMIT = 20;
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type ParseLimit = { allowed: true } | { allowed: false; resetAt: Date };

export async function getParseLimit(
  userId: string,
  now: Date,
): Promise<ParseLimit> {
  const where = {
    action: ACTION,
    key: userId,
    createdAt: { gt: new Date(now.getTime() - WINDOW_MS) },
  };
  const count = await db.rateLimitEvent.count({ where });
  if (count < PARSE_LIMIT) return { allowed: true };

  // The count drops below the limit when this event turns 24 hours old: the
  // oldest one at exactly 20, a later one after parallel requests overshoot.
  const freesSlot = await db.rateLimitEvent.findFirst({
    where,
    orderBy: { createdAt: "asc" },
    skip: count - PARSE_LIMIT,
    select: { createdAt: true },
  });
  // Rows are never deleted, so this only happens if the window moved on
  // between the two queries.
  if (!freesSlot) return { allowed: true };
  return {
    allowed: false,
    resetAt: new Date(freesSlot.createdAt.getTime() + WINDOW_MS),
  };
}

// Written before the API call, so a request counts even if the call fails or
// times out.
export async function recordParseRequest(userId: string): Promise<void> {
  await db.rateLimitEvent.create({ data: { action: ACTION, key: userId } });
}
