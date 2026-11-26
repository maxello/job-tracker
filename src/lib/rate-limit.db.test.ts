import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  checkRateLimit,
  checkRateLimitWithoutQueue,
  lockId,
  RateLimitBusyError,
  type RateLimitCounter,
} from "./rate-limit";

// Real-database checks of the shared rate limit (SPEC.md US-7, US-0, section
// 5, decision log 2026-11-26). Run with `npm run test:db` against
// job_tracker_e2e. Each test uses its own random action and keys. A check
// deletes its action's rows older than the window (plus the margin) for all
// keys, so a random action keeps every test's cleanup away from other tests'
// rows and from app rows.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const actions: string[] = [];

function newAction() {
  const action = `db-test-${randomUUID()}`;
  actions.push(action);
  return action;
}

function newKey() {
  return `db-test-key-${randomUUID()}`;
}

// `count` times, one minute apart, the newest one minute before `now`.
function minutesAgo(now: Date, count: number) {
  return Array.from(
    { length: count },
    (_, i) => new Date(now.getTime() - (i + 1) * MINUTE),
  );
}

async function seed(action: string, key: string, times: Date[]) {
  await db.rateLimitEvent.createMany({
    data: times.map((createdAt) => ({ action, key, createdAt })),
  });
}

function rowCount(action: string, key: string) {
  return db.rateLimitEvent.count({ where: { action, key } });
}

// The parse limit's numbers (US-7): 20 per rolling 24 hours, one counter.
function checkOne(action: string, key: string, now: Date) {
  return checkRateLimit({
    action,
    windowMs: DAY,
    counters: [{ key, limit: 20 }],
    now,
  });
}

afterAll(async () => {
  await db.rateLimitEvent.deleteMany({ where: { action: { in: actions } } });
});

describe("checkRateLimit, one counter (real database)", () => {
  it("allows a check with 19 counted in the window", async () => {
    const now = new Date();
    const action = newAction();
    const key = newKey();
    await seed(action, key, minutesAgo(now, 19));

    await expect(checkOne(action, key, now)).resolves.toEqual({
      allowed: true,
    });
  });

  it("blocks at 20, resetAt = oldest + window", async () => {
    const now = new Date();
    const action = newAction();
    const key = newKey();
    const times = minutesAgo(now, 20);
    await seed(action, key, times);

    const oldest = times[times.length - 1];
    await expect(checkOne(action, key, now)).resolves.toEqual({
      allowed: false,
      resetAt: new Date(oldest.getTime() + DAY),
    });
  });

  it("uses a rolling window (the row 1 s outside it isn't counted)", async () => {
    const now = new Date();
    const action = newAction();
    const outside = newKey();
    await seed(action, outside, [
      ...minutesAgo(now, 19),
      new Date(now.getTime() - DAY - 1_000),
    ]);
    const inside = newKey();
    const edge = new Date(now.getTime() - DAY + MINUTE);
    await seed(action, inside, [...minutesAgo(now, 19), edge]);

    await expect(checkOne(action, outside, now)).resolves.toEqual({
      allowed: true,
    });
    await expect(checkOne(action, inside, now)).resolves.toEqual({
      allowed: false,
      resetAt: new Date(edge.getTime() + DAY),
    });
  });

  it("doesn't count a row exactly one window old (allowed at resetAt)", async () => {
    const now = new Date();
    const action = newAction();
    const key = newKey();
    await seed(action, key, [
      ...minutesAgo(now, 19),
      new Date(now.getTime() - DAY),
    ]);

    await expect(checkOne(action, key, now)).resolves.toEqual({
      allowed: true,
    });
  });

  it("counts only this key's rows of this action", async () => {
    const now = new Date();
    const action = newAction();
    const key = newKey();
    await seed(action, key, minutesAgo(now, 19));
    await seed(action, newKey(), minutesAgo(now, 5));
    await seed(newAction(), key, minutesAgo(now, 5));

    await expect(checkOne(action, key, now)).resolves.toEqual({
      allowed: true,
    });
  });

  it("after an overshoot (22), resetAt = 3rd oldest + window", async () => {
    const now = new Date();
    const action = newAction();
    const key = newKey();
    const times = minutesAgo(now, 22); // newest first
    await seed(action, key, times);

    // Oldest first: the 3rd oldest must turn one window old to leave 19.
    const thirdOldest = times[times.length - 3];
    await expect(checkOne(action, key, now)).resolves.toEqual({
      allowed: false,
      resetAt: new Date(thirdOldest.getTime() + DAY),
    });
  });

  it("an allowed check writes one row for the key and action, createdAt = now", async () => {
    const now = new Date();
    const action = newAction();
    const key = newKey();

    await checkOne(action, key, now);

    const rows = await db.rateLimitEvent.findMany({ where: { key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe(action);
    expect(rows[0].createdAt).toEqual(now);
  });
});

describe("checkRateLimit, parallel checks (real database)", () => {
  // Limit 5, not 20 (measured 2026-11-26): the checks run in waves of 10, the
  // pool size, and 20 is a multiple of 10, so without the lock no wave crossed
  // the limit. With limit 5, any two overlapping checks overshoot it.
  it("25 parallel checks with limit 5: exactly 5 allowed, 20 at the limit, 5 rows", async () => {
    const action = newAction();
    const key = newKey();

    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        checkRateLimitWithoutQueue({
          action,
          windowMs: DAY,
          counters: [{ key, limit: 5 }],
          now: new Date(),
        }),
      ),
    );

    expect(results.filter((r) => r.allowed)).toHaveLength(5);
    expect(results.filter((r) => !r.allowed)).toHaveLength(20);
    await expect(rowCount(action, key)).resolves.toBe(5);
  });

  it("rejects when another transaction holds the lock, after lock_timeout, and writes no row", async () => {
    const action = newAction();
    const key = newKey();

    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let markLocked!: () => void;
    const locked = new Promise<void>((resolve) => (markLocked = resolve));
    const holder = db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId(action, key)}::bigint)`;
        markLocked();
        await released;
      },
      { timeout: 15_000 },
    );
    await Promise.race([locked, holder]);

    const started = Date.now();
    const outcome = await checkOne(action, key, new Date()).then(
      () => "resolved" as const,
      (error: unknown) => ({ error }),
    );
    const elapsed = Date.now() - started;
    release();
    await holder;

    expect(outcome).not.toBe("resolved");
    // The Postgres lock timeout (SQLSTATE 55P03), as Prisma 7.10.1 with the pg
    // adapter returns it: a raw query failure (P2010) whose driver adapter
    // error carries the Postgres code.
    expect(outcome).toMatchObject({
      error: {
        code: "P2010",
        meta: { driverAdapterError: { cause: { code: "55P03" } } },
      },
    });
    expect(elapsed).toBeGreaterThanOrEqual(1_500);
    expect(elapsed).toBeLessThan(4_000);
    await expect(rowCount(action, key)).resolves.toBe(0);
  });
});

describe("checkRateLimit queue (real database, decision log 2026-11-26)", () => {
  type Outcome = { result: unknown } | { error: unknown };
  const outcome = (promise: Promise<unknown>): Promise<Outcome> =>
    promise.then(
      (result) => ({ result }),
      (error: unknown) => ({ error }),
    );

  // The measurement from the "rate-limit queue" entry: without the queue the
  // check on key B failed with P2028 in 3 of 3 runs at 50 and at 200.
  it.each([50, 200])(
    "a burst of %i checks on one key doesn't starve a check on another key",
    async (burstSize) => {
      const action = newAction();
      const busyKey = newKey();
      const otherKey = newKey();

      const burst = Array.from({ length: burstSize }, () =>
        outcome(checkOne(action, busyKey, new Date())),
      );
      const other = await outcome(checkOne(action, otherKey, new Date()));
      const burstOutcomes = await Promise.all(burst);

      expect(other).toEqual({ result: { allowed: true } });
      const errors = burstOutcomes.flatMap((o) =>
        "error" in o ? [o.error] : [],
      );
      expect(errors.length).toBeGreaterThan(0);
      for (const error of errors) {
        expect(error).toBeInstanceOf(RateLimitBusyError);
      }
    },
  );

  it("6 parallel checks on one key: 5 allowed, 1 rejected by the queue, exactly 5 rows", async () => {
    const action = newAction();
    const key = newKey();

    const outcomes = await Promise.all(
      Array.from({ length: 6 }, () =>
        outcome(checkOne(action, key, new Date())),
      ),
    );

    expect(
      outcomes.filter(
        (o) => "result" in o && (o.result as { allowed: boolean }).allowed,
      ),
    ).toHaveLength(5);
    const errors = outcomes.flatMap((o) => ("error" in o ? [o.error] : []));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(RateLimitBusyError);
    await expect(rowCount(action, key)).resolves.toBe(5);
  });
});

describe("checkRateLimit, several counters (real database)", () => {
  const WINDOW = 15 * MINUTE;

  function check(action: string, counters: RateLimitCounter[], now: Date) {
    return checkRateLimit({ action, windowMs: WINDOW, counters, now });
  }

  it("blocks when any counter is over: [B, A], A (second) at its limit", async () => {
    const now = new Date();
    const action = newAction();
    const a = newKey();
    const b = newKey();
    await seed(action, a, minutesAgo(now, 5));
    await seed(action, b, minutesAgo(now, 2));

    const result = await check(
      action,
      [
        { key: b, limit: 20 },
        { key: a, limit: 5 },
      ],
      now,
    );

    expect(result.allowed).toBe(false);
    await expect(rowCount(action, a)).resolves.toBe(5);
    await expect(rowCount(action, b)).resolves.toBe(2);
  });

  it("with two over, resetAt is the later one: [B, A], A's (second) is later", async () => {
    const now = new Date();
    const action = newAction();
    const a = newKey();
    const b = newKey();
    // A: 1, 2, 3 minutes ago → resets when the 3-minute one turns 15 old.
    const aTimes = minutesAgo(now, 3);
    await seed(action, a, aTimes);
    // B: 10, 11, 12 minutes ago → resets earlier.
    const bTimes = [10, 11, 12].map(
      (m) => new Date(now.getTime() - m * MINUTE),
    );
    await seed(action, b, bTimes);

    await expect(
      check(
        action,
        [
          { key: b, limit: 3 },
          { key: a, limit: 3 },
        ],
        now,
      ),
    ).resolves.toEqual({
      allowed: false,
      resetAt: new Date(aTimes[2].getTime() + WINDOW),
    });
    await expect(rowCount(action, a)).resolves.toBe(3);
    await expect(rowCount(action, b)).resolves.toBe(3);
  });

  it("gives each counter its own limit: [A] blocked, [B, A] blocked (stricter A second), [B] allowed", async () => {
    const now = new Date();
    const action = newAction();
    const a = newKey();
    const b = newKey();
    await seed(action, a, minutesAgo(now, 5));
    await seed(action, b, minutesAgo(now, 5));
    const counterA = { key: a, limit: 5 };
    const counterB = { key: b, limit: 20 };

    const aAlone = await check(action, [counterA], now);
    expect(aAlone.allowed).toBe(false);

    const both = await check(action, [counterB, counterA], now);
    expect(both.allowed).toBe(false);
    await expect(rowCount(action, a)).resolves.toBe(5);
    await expect(rowCount(action, b)).resolves.toBe(5);

    await expect(check(action, [counterB], now)).resolves.toEqual({
      allowed: true,
    });
  });

  it("allows when both are under: [B, A], one new row for each", async () => {
    const now = new Date();
    const action = newAction();
    const a = newKey();
    const b = newKey();
    await seed(action, a, minutesAgo(now, 4));
    await seed(action, b, minutesAgo(now, 5));

    await expect(
      check(
        action,
        [
          { key: b, limit: 20 },
          { key: a, limit: 5 },
        ],
        now,
      ),
    ).resolves.toEqual({ allowed: true });
    await expect(rowCount(action, a)).resolves.toBe(5);
    await expect(rowCount(action, b)).resolves.toBe(6);
  });
});

describe("checkRateLimit cleanup (real database)", () => {
  it("deletes only this action's rows older than the window + 1 h, for all keys", async () => {
    const now = new Date();
    const action = newAction();
    const other = newAction();
    const checked = newKey();
    const k1 = newKey();
    const k2 = newKey();

    const old = new Date(now.getTime() - DAY - HOUR - MINUTE);
    const inMargin = new Date(now.getTime() - DAY - 30 * MINUTE);
    const inWindow = new Date(now.getTime() - MINUTE);
    for (const key of [k1, k2]) {
      await seed(action, key, [old, inMargin, inWindow]);
    }
    await seed(other, k1, [old]);

    await checkOne(action, checked, now);

    for (const key of [k1, k2]) {
      const rows = await db.rateLimitEvent.findMany({
        where: { action, key },
        orderBy: { createdAt: "asc" },
      });
      expect(rows.map((r) => r.createdAt)).toEqual([inMargin, inWindow]);
    }
    const otherRows = await db.rateLimitEvent.findMany({
      where: { action: other },
    });
    expect(otherRows.map((r) => r.createdAt)).toEqual([old]);
  });
});
