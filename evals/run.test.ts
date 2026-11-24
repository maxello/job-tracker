import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParseResult } from "@/features/job-parsing/client";
import type { Example, Label } from "./examples";
import { runEval, type ParseFn } from "./run";

const label: Label = {
  isJobPosting: true,
  company: "Acme",
  role: "Engineer",
  location: null,
  level: null,
  stack: [],
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
};

const examples: Example[] = ["a", "b", "c"].map((name) => ({
  name,
  text: `text ${name}`,
  label,
}));

const good: ParseResult = { ok: true, output: label };

const settle = vi.fn();

// `npm test` never reaches the network.
beforeEach(() => {
  settle.mockReset();
  settle.mockResolvedValue({ input: 1, output: 1, unknown: 0 });
  vi.stubGlobal("fetch", () => Promise.reject(new Error("no network")));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("runEval (US-7 eval)", () => {
  it("runs the set 3 times in order, one request at a time", async () => {
    let active = 0;
    let max = 0;
    const texts: string[] = [];
    const parse: ParseFn = async (text) => {
      active += 1;
      max = Math.max(max, active);
      texts.push(text);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return good;
    };

    const result = await runEval({ examples, parse, settle });

    const set = ["text a", "text b", "text c"];
    expect(texts).toEqual([...set, ...set, ...set]);
    expect(max).toBe(1);
    expect(
      result.runs.map((run) => run.results.map((r) => r.example.name)),
    ).toEqual([
      ["a", "b", "c"],
      ["a", "b", "c"],
      ["a", "b", "c"],
    ]);
  });

  it("is complete when every result is scored, a timeout included", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const parse: ParseFn = async (text) => {
      if (text !== "text b") return good;
      vi.setSystemTime(Date.now() + 30_000);
      return { ok: false, category: "timeout" };
    };
    const result = await runEval({ examples, parse, settle });
    expect(result.runs).toHaveLength(3);
    expect(result.complete).toBe(true);
    expect(result.runs[0].results[0].score).toMatchObject({
      kind: "scored",
      flag: true,
    });
    expect(result.runs[0].results[1].outcome).toEqual({
      kind: "failed",
      category: "timeout",
    });
  });

  it.each([10_700, 28_999])(
    "takes a timeout after %i ms as an unscored connection error",
    async (elapsed) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const parse: ParseFn = async () => {
        vi.setSystemTime(Date.now() + elapsed);
        return { ok: false, category: "timeout" };
      };
      const result = await runEval({ examples, parse, settle });
      expect(result.complete).toBe(false);
      // Each request has its own start: the last one is no different.
      for (const { score } of result.runs.flatMap((run) => run.results)) {
        expect(score).toEqual({ kind: "unscored", category: "api_connection" });
      }
    },
  );

  it.each([29_000, 29_990])(
    "keeps a timeout after %i ms as a scored timeout",
    async (elapsed) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const parse: ParseFn = async () => {
        vi.setSystemTime(Date.now() + elapsed);
        return { ok: false, category: "timeout" };
      };
      const result = await runEval({ examples, parse, settle });
      expect(result.complete).toBe(true);
      for (const { outcome, score } of result.runs.flatMap((r) => r.results)) {
        expect(outcome).toEqual({ kind: "failed", category: "timeout" });
        expect(score).toMatchObject({ kind: "scored", flag: false });
      }
    },
  );

  it("gives each request the 30 s budget from its own start, as deadline and signal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T10:00:00Z"));
    const start = Date.now();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const calls: { signal: AbortSignal; deadline: number }[] = [];
    const parse: ParseFn = async (_text, options) => {
      calls.push(options);
      vi.setSystemTime(Date.now() + 10_000);
      return good;
    };

    await runEval({ examples, parse, settle });

    expect(calls).toHaveLength(9);
    expect(timeout.mock.calls).toEqual(
      Array.from({ length: 9 }, () => [30_000]),
    );
    calls.forEach((call, i) => {
      expect(call.deadline).toBe(start + i * 10_000 + 30_000);
      expect(call.signal).toBe(timeout.mock.results[i].value);
    });
  });

  it("continues after an unscored error and is incomplete", async () => {
    let count = 0;
    const parse: ParseFn = async () => {
      count += 1;
      return count === 2 ? { ok: false, category: "api_server" } : good;
    };
    const result = await runEval({ examples, parse, settle });
    expect(count).toBe(9);
    expect(result.complete).toBe(false);
    expect(result.runs[0].results[1].score).toEqual({
      kind: "unscored",
      category: "api_server",
    });
  });

  it("takes a parse that throws as an unscored unexpected error", async () => {
    let count = 0;
    const parse: ParseFn = async () => {
      count += 1;
      if (count === 1) throw new Error("boom");
      return good;
    };
    const result = await runEval({ examples, parse, settle });
    expect(count).toBe(9);
    expect(result.complete).toBe(false);
    expect(result.runs[0].results[0].score).toEqual({
      kind: "unscored",
      category: "unexpected",
    });
  });

  it("settles the usage after each request and sums it per run", async () => {
    const log: string[] = [];
    const parse: ParseFn = async () => {
      log.push("parse");
      return good;
    };
    settle.mockImplementation(async () => {
      log.push("settle");
      return { input: 10, output: 2, unknown: 1 };
    });
    const result = await runEval({ examples, parse, settle });
    expect(log).toEqual(
      Array.from({ length: 9 }, () => ["parse", "settle"]).flat(),
    );
    const usage = { input: 30, output: 6, unknown: 3 };
    expect(result.runs.map((run) => run.usage)).toEqual([usage, usage, usage]);
  });
});
