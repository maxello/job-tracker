import { createHash } from "node:crypto";
import { db } from "@/lib/db";

// Shared rate limit on RateLimitEvent (SPEC.md US-7, US-0, section 5,
// decision log 2026-11-26 "atomic rate-limit check", "cleanup margin",
// "rate-limit queue" and "rate-limit queue details"). A check has one action
// and window and one or more counters (keys), each with its own limit. Checks
// of the same counter first wait in an in-process queue, so only its head
// holds a database connection; the head then runs under a transaction-level
// advisory lock, which covers all instances. Callers fail closed on any
// error.

export type RateLimitCounter = { key: string; limit: number };
export type RateLimitResult =
  { allowed: true } | { allowed: false; resetAt: Date };

// A check rejected by the in-process queue: a full queue, or a wait too long.
// It records nothing.
export class RateLimitBusyError extends Error {
  constructor() {
    super("Rate-limit queue busy");
    this.name = "RateLimitBusyError";
  }
}

// One queue per counter id. `capacity` counts the running check too. A check
// with several ids joins all their queues at once, only if none is full, and
// starts once it is the head of every one; `maxWaitMs` runs from joining to
// starting, in total. Checks join in one synchronous step, so any two share
// the same order in every queue they have in common and can't deadlock.
export function createCounterQueue({
  capacity,
  maxWaitMs,
}: {
  capacity: number;
  maxWaitMs: number;
}) {
  type Entry = { ids: string[]; wake: () => void };
  const queues = new Map<string, Entry[]>();

  const isHead = (entry: Entry) =>
    entry.ids.every((id) => queues.get(id)?.[0] === entry);

  // Removes the entry from its queues and lets the new heads start.
  function leave(entry: Entry) {
    for (const id of entry.ids) {
      const queue = queues.get(id);
      if (!queue) continue;
      const index = queue.indexOf(entry);
      if (index !== -1) queue.splice(index, 1);
      if (queue.length === 0) queues.delete(id);
    }
    for (const id of entry.ids) queues.get(id)?.[0]?.wake();
  }

  return {
    run<T>(ids: string[], work: () => Promise<T>): Promise<T> {
      if (ids.some((id) => (queues.get(id)?.length ?? 0) >= capacity)) {
        return Promise.reject(new RateLimitBusyError());
      }

      return new Promise<T>((resolve, reject) => {
        let started = false;
        const entry: Entry = {
          ids,
          wake: () => {
            if (started || !isHead(entry)) return;
            started = true;
            clearTimeout(timer);
            // A rejection or a timeout inside `work` frees the place too.
            Promise.resolve()
              .then(work)
              .then(resolve, reject)
              .finally(() => leave(entry));
          },
        };
        for (const id of ids) {
          const queue = queues.get(id);
          if (queue) queue.push(entry);
          else queues.set(id, [entry]);
        }
        const timer = setTimeout(() => {
          if (started) return;
          leave(entry);
          reject(new RateLimitBusyError());
        }, maxWaitMs);
        entry.wake();
      });
    },
  };
}

// Decision log 2026-11-26 "rate-limit queue details": 5 at once per counter,
// the running check included; 2 s in total to start.
const queue = createCounterQueue({ capacity: 5, maxWaitMs: 2_000 });

// Checks every counter and, only when all are under their limits, records one
// row per counter (createdAt = now), after waiting in the in-process queue of
// each counter. Throws RateLimitBusyError when a queue rejects the check.
export function checkRateLimit(check: {
  action: string;
  windowMs: number;
  counters: RateLimitCounter[];
  now: Date;
}): Promise<RateLimitResult> {
  const ids = lockIds(
    check.action,
    check.counters.map((counter) => counter.key),
  );
  return queue.run(ids.map(String), () => checkRateLimitWithoutQueue(check));
}

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

// The check itself, with no queue: actions call checkRateLimit; exported only
// for the advisory-lock db test. When blocked, resetAt is when every counter
// is back under its limit: the latest of the counters' reset times.
export async function checkRateLimitWithoutQueue({
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

