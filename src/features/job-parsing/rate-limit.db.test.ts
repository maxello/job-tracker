import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getParseLimit, recordParseRequest } from "./rate-limit";

// Real-database checks of the parse rate limit (SPEC.md US-7, decision log
// 2026-11-23). Run with `npm run test:db` against job_tracker_e2e. Keys are
// random, so no other row is counted or deleted.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const keys: string[] = [];

function newKey() {
  const key = `db-test-${randomUUID()}`;
  keys.push(key);
  return key;
}

// `count` events, one minute apart, the newest one minute before `now`.
function minutesAgo(now: Date, count: number) {
  return Array.from(
    { length: count },
    (_, i) => new Date(now.getTime() - (i + 1) * MINUTE),
  );
}

async function seed(key: string, times: Date[], action = "parse") {
  await db.rateLimitEvent.createMany({
    data: times.map((createdAt) => ({ action, key, createdAt })),
  });
}

afterAll(async () => {
  await db.rateLimitEvent.deleteMany({ where: { key: { in: keys } } });
});

describe("getParseLimit (real database)", () => {
  it("allows a request with 19 counted in the window", async () => {
    const now = new Date();
    const key = newKey();
    await seed(key, minutesAgo(now, 19));

    await expect(getParseLimit(key, now)).resolves.toEqual({ allowed: true });
  });

  it("blocks at 20, until the oldest turns 24 hours old", async () => {
    const now = new Date();
    const key = newKey();
    const times = minutesAgo(now, 20);
    await seed(key, times);

    const oldest = times[times.length - 1];
    await expect(getParseLimit(key, now)).resolves.toEqual({
      allowed: false,
      resetAt: new Date(oldest.getTime() + DAY),
    });
  });

  it("uses a rolling 24-hour window", async () => {
    const now = new Date();
    const outside = newKey();
    await seed(outside, [
      ...minutesAgo(now, 19),
      new Date(now.getTime() - DAY - 1_000),
    ]);
    const inside = newKey();
    const edge = new Date(now.getTime() - DAY + MINUTE);
    await seed(inside, [...minutesAgo(now, 19), edge]);

    await expect(getParseLimit(outside, now)).resolves.toEqual({
      allowed: true,
    });
    await expect(getParseLimit(inside, now)).resolves.toEqual({
      allowed: false,
      resetAt: new Date(edge.getTime() + DAY),
    });
  });

  it("counts only this key's parse events", async () => {
    const now = new Date();
    const key = newKey();
    await seed(key, minutesAgo(now, 19));
    await seed(newKey(), minutesAgo(now, 5));
    await seed(key, minutesAgo(now, 5), "sign-in");

    await expect(getParseLimit(key, now)).resolves.toEqual({ allowed: true });
  });

  it("after an overshoot, resets when the count drops below 20", async () => {
    const now = new Date();
    const key = newKey();
    const times = minutesAgo(now, 22); // newest first
    await seed(key, times);

    // Oldest first: the 3rd oldest must turn 24 hours old to leave 19.
    const thirdOldest = times[times.length - 3];
    await expect(getParseLimit(key, now)).resolves.toEqual({
      allowed: false,
      resetAt: new Date(thirdOldest.getTime() + DAY),
    });
  });
});

describe("recordParseRequest (real database)", () => {
  it("writes one parse event for the key, timestamped now", async () => {
    const key = newKey();
    const before = Date.now();

    await recordParseRequest(key);

    const rows = await db.rateLimitEvent.findMany({ where: { key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("parse");
    // The database clock may differ a little from this process's clock.
    expect(Math.abs(rows[0].createdAt.getTime() - before)).toBeLessThan(MINUTE);
  });
});
