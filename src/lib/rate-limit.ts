import { createHash } from "node:crypto";
import { db } from "@/lib/db";

// Shared rate limit on RateLimitEvent (SPEC.md US-7, US-0, section 5,
// decision log 2026-11-26 "atomic rate-limit check" and "cleanup margin").
// A check has one action and window and one or more counters (keys), each
// with its own limit. Checks of the same counter run one at a time under a
// transaction-level advisory lock; callers fail closed on any error.

export type RateLimitCounter = { key: string; limit: number };
export type RateLimitResult =
  { allowed: true } | { allowed: false; resetAt: Date };

// Rows are deleted only once they are this much older than the window, so a
// check still waiting on its lock (with an earlier `now`) never loses a row
// it can count to another check's cleanup.
const CLEANUP_MARGIN_MS = 60 * 60 * 1000;

// The first 8 bytes of SHA-256 of "action:key", read as a signed int64 so it
// always fits a Postgres bigint. A collision only makes two counters wait for
// each other; it never changes a count.
export function lockId(action: string, key: string): bigint {
  return createHash("sha256")
    .update(`${action}:${key}`)
    .digest()
    .readBigInt64BE(0);
}

// Sorted ascending, so two checks that share counters take their locks in the
// same order and can't deadlock.
export function lockIds(action: string, keys: string[]): bigint[] {
  return keys
    .map((key) => lockId(action, key))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// Checks every counter and, only when all are under their limits, records one
// row per counter (createdAt = now). When blocked, resetAt is when every
// counter is back under its limit: the latest of the counters' reset times.
export async function checkRateLimit({
  action,
  windowMs,
  counters,
  now,
}: {
  action: string;
  windowMs: number;
  counters: RateLimitCounter[];
  now: Date;
}): Promise<RateLimitResult> {
  const cutoff = new Date(now.getTime() - windowMs);

  // A separate statement before the locked transaction, so the lock covers
  // only the count and the insert. Its failure is a check failure.
  await db.rateLimitEvent.deleteMany({
    where: {
      action,
      createdAt: { lt: new Date(cutoff.getTime() - CLEANUP_MARGIN_MS) },
    },
  });

  return db.$transaction(async (tx) => {
    // Bounds the wait for each advisory lock; ends with the transaction.
    await tx.$executeRaw`SET LOCAL lock_timeout = '2s'`;
    for (const id of lockIds(
      action,
      counters.map((counter) => counter.key),
    )) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${id}::bigint)`;
    }

    let resetAt: Date | null = null;
    for (const { key, limit } of counters) {
      const rows = await tx.rateLimitEvent.findMany({
        where: { action, key, createdAt: { gt: cutoff } },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { createdAt: true },
      });
      if (rows.length < limit) continue;
      // The limit-th newest is the (count − limit + 1)-th oldest: when it
      // leaves the window, the count drops below the limit.
      const counterReset = new Date(
        rows[limit - 1].createdAt.getTime() + windowMs,
      );
      if (resetAt === null || counterReset > resetAt) resetAt = counterReset;
    }
    if (resetAt !== null) return { allowed: false, resetAt };

    await tx.rateLimitEvent.createMany({
      data: counters.map(({ key }) => ({ action, key, createdAt: now })),
    });
    return { allowed: true };
  });
}
