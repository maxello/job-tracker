import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { checkRateLimit, lockId, lockIds } from "./rate-limit";

// A fake database: the module imports without DATABASE_URL, and the
// transaction records every raw statement (its template strings and values).
const { db, rawCalls } = vi.hoisted(() => {
  const rawCalls: { strings: string[]; values: unknown[] }[] = [];
  const tx = {
    $executeRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        rawCalls.push({ strings: [...strings], values });
        return 0;
      },
    ),
    rateLimitEvent: {
      findMany: vi.fn(async () => []),
      createMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  const db = {
    rateLimitEvent: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { db, rawCalls };
});
vi.mock("@/lib/db", () => ({ db }));

const INT64_MIN = -(BigInt(2) ** BigInt(63));
const INT64_MAX = BigInt(2) ** BigInt(63) - BigInt(1);

// Decision log 2026-11-26: the first 8 bytes of SHA-256 of "action:key".
function expectedId(action: string, key: string) {
  return createHash("sha256")
    .update(`${action}:${key}`)
    .digest()
    .readBigInt64BE(0);
}

describe("lockId (decision log 2026-11-26)", () => {
  it("is deterministic: the first 8 bytes of SHA-256 of action:key", () => {
    expect(lockId("parse", "user-a")).toBe(lockId("parse", "user-a"));
    expect(lockId("parse", "user-a")).toBe(expectedId("parse", "user-a"));
    expect(lockId("sign-in", "a@example.com")).toBe(
      expectedId("sign-in", "a@example.com"),
    );
  });

  it("fits a Postgres bigint", () => {
    const inputs = [
      ["parse", "user-a"],
      ["parse", "user-b"],
      ["sign-in", "a@example.com"],
      ["sign-in", "203.0.113.7"],
      ["sign-up", "unknown"],
      ["", ""],
    ];
    for (const [action, key] of inputs) {
      const id = lockId(action, key);
      expect(typeof id).toBe("bigint");
      expect(id >= INT64_MIN && id <= INT64_MAX).toBe(true);
    }
  });

  it("differs per counter (action and key)", () => {
    const ids = new Set([
      lockId("parse", "a"),
      lockId("sign-in", "a"),
      lockId("parse", "b"),
    ]);
    expect(ids.size).toBe(3);
  });
});

describe("lockIds (decision log 2026-11-26)", () => {
  it("sorts the ids ascending whatever the order of the keys", () => {
    const keys = ["a@example.com", "203.0.113.7", "unknown"];
    const sorted = keys
      .map((key) => expectedId("sign-in", key))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    expect(lockIds("sign-in", keys)).toEqual(sorted);
    expect(lockIds("sign-in", [...keys].reverse())).toEqual(sorted);
    expect(lockIds("sign-in", [keys[1], keys[2], keys[0]])).toEqual(sorted);
  });
});

describe("checkRateLimit lock order (decision log 2026-11-26)", () => {
  it("takes the advisory locks in ascending id order, whatever the counter order", async () => {
    rawCalls.length = 0;
    const action = "sign-in";
    const [first, second] = ["a@example.com", "203.0.113.7"];
    const ids = {
      [first]: expectedId(action, first),
      [second]: expectedId(action, second),
    };
    // Pass the counters in descending id order, so a loop that keeps the
    // caller's order can't pass by chance.
    const [high, low] =
      ids[first] > ids[second] ? [first, second] : [second, first];
    expect(ids[high] > ids[low]).toBe(true);

    await checkRateLimit({
      action,
      windowMs: 15 * 60 * 1000,
      counters: [
        { key: high, limit: 20 },
        { key: low, limit: 5 },
      ],
      now: new Date("2026-11-26T12:00:00Z"),
    });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const sql = rawCalls.map((call) => call.strings.join("?"));
    const lockCalls = rawCalls.filter((call) =>
      call.strings.join("?").includes("pg_advisory_xact_lock"),
    );
    expect(lockCalls.map((call) => call.values)).toEqual([
      [ids[low]],
      [ids[high]],
    ]);
    const timeoutAt = sql.findIndex((s) =>
      s.includes("SET LOCAL lock_timeout"),
    );
    const firstLockAt = sql.findIndex((s) =>
      s.includes("pg_advisory_xact_lock"),
    );
    expect(timeoutAt).toBeGreaterThanOrEqual(0);
    expect(timeoutAt).toBeLessThan(firstLockAt);
  });
});
