import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkRateLimit,
  createCounterQueue,
  lockId,
  lockIds,
  RateLimitBusyError,
} from "./rate-limit";

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

// The in-process queue per counter (SPEC.md US-0, US-7, decision log
// 2026-11-26 "rate-limit queue" and "rate-limit queue details"): at most 5
// checks at once per counter, the running one included; a wait longer than
// 2 s in total to reach the head of every queue rejects.
const CAPACITY = 5;
const MAX_WAIT_MS = 2_000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type Queue = ReturnType<typeof createCounterQueue>;
type JobState = {
  status: "pending" | "resolved" | "rejected";
  value?: unknown;
  error?: unknown;
};

// One check in the queue. Its work runs until the test settles `done`; `state`
// records how `run` settled.
function join(queue: Queue, ids: string[]) {
  const done = deferred<string>();
  const work = vi.fn(() => done.promise);
  const state: JobState = { status: "pending" };
  const settled = queue.run(ids, work).then(
    (value) => {
      state.status = "resolved";
      state.value = value;
    },
    (error: unknown) => {
      state.status = "rejected";
      state.error = error;
    },
  );
  return { work, done, state, settled };
}

// Lets promise callbacks run without moving the fake clock.
const flush = () => vi.advanceTimersByTimeAsync(0);

function newQueue() {
  vi.useFakeTimers();
  return createCounterQueue({ capacity: CAPACITY, maxWaitMs: MAX_WAIT_MS });
}

describe("createCounterQueue (decision log 2026-11-26)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("caps 5 checks at once, the running one included: the 6th rejects at once", async () => {
    const queue = newQueue();
    const jobs = Array.from({ length: CAPACITY }, () => join(queue, ["a"]));
    await flush();

    expect(jobs[0].work).toHaveBeenCalledTimes(1);
    for (const job of jobs.slice(1)) expect(job.work).not.toHaveBeenCalled();
    for (const job of jobs) expect(job.state.status).toBe("pending");

    const sixth = join(queue, ["a"]);
    await flush();
    expect(sixth.state.status).toBe("rejected");
    expect(sixth.state.error).toBeInstanceOf(RateLimitBusyError);
    expect(sixth.work).not.toHaveBeenCalled();
  });

  it("frees the place when the running check settles: a new 6th is accepted", async () => {
    const queue = newQueue();
    const jobs = Array.from({ length: CAPACITY }, () => join(queue, ["a"]));
    await flush();

    jobs[0].done.resolve("first");
    await flush();
    expect(jobs[0].state).toEqual({ status: "resolved", value: "first" });
    expect(jobs[1].work).toHaveBeenCalledTimes(1);

    const next = join(queue, ["a"]);
    await flush();
    expect(next.state.status).toBe("pending");
    expect(next.work).not.toHaveBeenCalled();
  });

  it("rejects a check that waits longer than 2 s, and it holds no place after", async () => {
    const queue = newQueue();
    const head = join(queue, ["a"]);
    const waiter = join(queue, ["a"]);
    await flush();

    await vi.advanceTimersByTimeAsync(MAX_WAIT_MS - 1);
    expect(waiter.state.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(waiter.state.status).toBe("rejected");
    expect(waiter.state.error).toBeInstanceOf(RateLimitBusyError);
    expect(waiter.work).not.toHaveBeenCalled();

    // The head and 4 new checks make 5 at once: all accepted, the next rejected.
    const more = Array.from({ length: CAPACITY - 1 }, () => join(queue, ["a"]));
    await flush();
    for (const job of more) expect(job.state.status).toBe("pending");
    const extra = join(queue, ["a"]);
    await flush();
    expect(extra.state.status).toBe("rejected");
    expect(head.state.status).toBe("pending");
  });

  it("moves on when the running check throws, and passes its error to its caller", async () => {
    const queue = newQueue();
    const head = join(queue, ["a"]);
    const next = join(queue, ["a"]);
    await flush();
    expect(next.work).not.toHaveBeenCalled();

    const boom = new Error("boom");
    head.done.reject(boom);
    await flush();
    expect(head.state).toEqual({ status: "rejected", error: boom });
    expect(next.work).toHaveBeenCalledTimes(1);
  });

  it("moves on when the running check times out (a P2028-like rejection at 1.5 s)", async () => {
    const queue = newQueue();
    const timedOut = Object.assign(new Error("Transaction already closed"), {
      code: "P2028",
    });
    const headWork = vi.fn(
      () =>
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(timedOut), 1_500),
        ),
    );
    const head = queue.run(["a"], headWork).catch((error: unknown) => error);
    const next = join(queue, ["a"]);
    await flush();
    expect(next.work).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_500);
    await expect(head).resolves.toBe(timedOut);
    expect(next.work).toHaveBeenCalledTimes(1);

    // Running now: the 2 s wait no longer applies to it.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(next.state.status).toBe("pending");
    next.done.resolve("next");
    await flush();
    expect(next.state).toEqual({ status: "resolved", value: "next" });
  });

  it("doesn't stall behind a waiter that timed out", async () => {
    const queue = newQueue();
    const head = join(queue, ["a"]);
    const second = join(queue, ["a"]);
    await vi.advanceTimersByTimeAsync(1_000);
    const third = join(queue, ["a"]);
    await flush();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(second.state.status).toBe("rejected");
    expect(third.state.status).toBe("pending");
    expect(third.work).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    head.done.resolve("head");
    await flush();
    expect(third.work).toHaveBeenCalledTimes(1);
  });

  it("starts waiting checks in the order they joined", async () => {
    const queue = newQueue();
    const jobs = Array.from({ length: 4 }, () => join(queue, ["a"]));
    await flush();

    for (let i = 0; i < jobs.length; i++) {
      expect(jobs.map((job) => job.work.mock.calls.length)).toEqual(
        jobs.map((_, j) => (j <= i ? 1 : 0)),
      );
      jobs[i].done.resolve(`job ${i}`);
      await flush();
    }
  });

  it("keeps counters apart: a busy counter doesn't delay another", async () => {
    const queue = newQueue();
    const busy = Array.from({ length: CAPACITY }, () => join(queue, ["a"]));
    const other = join(queue, ["b"]);
    await flush();

    expect(busy[0].work).toHaveBeenCalledTimes(1);
    expect(other.work).toHaveBeenCalledTimes(1);
  });

  it("with several counters, rejects at once if any queue is full and holds no place in the others", async () => {
    const queue = newQueue();
    const full = Array.from({ length: CAPACITY }, () => join(queue, ["b"]));
    const both = join(queue, ["a", "b"]);
    await flush();
    expect(both.state.status).toBe("rejected");
    expect(both.state.error).toBeInstanceOf(RateLimitBusyError);
    expect(both.work).not.toHaveBeenCalled();

    // Queue a is still empty: it takes 5, not 4.
    const onA = Array.from({ length: CAPACITY }, () => join(queue, ["a"]));
    await flush();
    for (const job of onA) expect(job.state.status).toBe("pending");
    expect(onA[0].work).toHaveBeenCalledTimes(1);
    const sixth = join(queue, ["a"]);
    await flush();
    expect(sixth.state.status).toBe("rejected");
    expect(full[0].work).toHaveBeenCalledTimes(1);
  });

  it("with several counters, the 2 s are in total, not per queue", async () => {
    const queue = newQueue();
    const headA = join(queue, ["a"]);
    const headB = join(queue, ["b"]);
    const both = join(queue, ["a", "b"]);
    await flush();

    await vi.advanceTimersByTimeAsync(1_500);
    headA.done.resolve("a");
    await flush();
    expect(both.state.status).toBe("pending");
    expect(both.work).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(499);
    expect(both.state.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(1);
    expect(both.state.status).toBe("rejected");
    expect(both.state.error).toBeInstanceOf(RateLimitBusyError);

    await vi.advanceTimersByTimeAsync(500);
    headB.done.resolve("b");
    await flush();
    expect(both.work).not.toHaveBeenCalled();
  });

  it("with several counters, starts only once it is the head of all of them", async () => {
    const queue = newQueue();
    const headB = join(queue, ["b"]);
    const both = join(queue, ["a", "b"]);
    await flush();
    expect(both.work).not.toHaveBeenCalled();

    headB.done.resolve("b");
    await flush();
    expect(both.work).toHaveBeenCalledTimes(1);
  });
});

describe("checkRateLimit queue (decision log 2026-11-26)", () => {
  it("runs the cleanup only as the queue head, and a 6th check touches nothing", async () => {
    db.rateLimitEvent.deleteMany.mockClear();
    db.$transaction.mockClear();
    const passThrough = db.$transaction.getMockImplementation()!;
    const hold = deferred<void>();
    // The head's transaction stays open until the test releases it.
    db.$transaction.mockImplementationOnce(async (fn) => {
      await hold.promise;
      return passThrough(fn);
    });
    const check = () =>
      checkRateLimit({
        action: "parse",
        windowMs: 24 * 60 * 60 * 1000,
        counters: [{ key: "user-queue-test", limit: 20 }],
        now: new Date(),
      });
    const settle = (promise: Promise<unknown>) =>
      promise.then(
        () => "resolved" as const,
        (error: unknown) => ({ error }),
      );

    // 1 running + 4 waiting.
    const first = Array.from({ length: CAPACITY }, () => settle(check()));
    try {
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(db.rateLimitEvent.deleteMany).toHaveBeenCalledTimes(1);
      expect(db.$transaction).toHaveBeenCalledTimes(1);

      const sixth = await settle(check());
      expect(sixth).toEqual({ error: expect.any(RateLimitBusyError) });
      expect(db.rateLimitEvent.deleteMany).toHaveBeenCalledTimes(1);
      expect(db.$transaction).toHaveBeenCalledTimes(1);
    } finally {
      // Empties the module-level queue for the tests after this one.
      hold.resolve();
      await Promise.all(first);
    }
  });
});
