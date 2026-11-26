import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { lockId, lockIds } from "./rate-limit";

// The lock ids need no database; the mock lets the module import without
// DATABASE_URL.
vi.mock("@/lib/db", () => ({ db: {} }));

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
