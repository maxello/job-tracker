import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseJobPostingAction } from "./actions";

// Runs before the imports above, so the module loads with its env set; only
// the import test below loads it without.
vi.hoisted(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("PARSE_MODEL", "test-model");
});

const mocks = vi.hoisted(() => ({
  requestParse: vi.fn(),
  checkRateLimit: vi.fn(),
  tryGetCurrentUserId: vi.fn(),
}));

vi.mock("./client", () => ({ requestParse: mocks.requestParse }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/lib/current-user", () => ({
  tryGetCurrentUserId: mocks.tryGetCurrentUserId,
}));

const USER = "user-a";
const TEXT = "Senior Frontend Engineer at Acme, Kyiv. React, TypeScript.";
const GENERIC =
  "Couldn't parse the posting. Try again or fill in the form manually.";
const NOT_POSTING = "This doesn't look like a job posting.";
const LOG_MESSAGE = "Job posting parse failed";

const output = {
  isJobPosting: true,
  company: "Acme",
  role: "Senior Frontend Engineer",
  location: "Kyiv",
  level: "Senior",
  stack: ["React", "TypeScript"],
  salaryMin: 50000,
  salaryMax: 70000,
  salaryCurrency: "usd",
};
// Model output that must never reach a log.
const MODEL_ONLY_VALUE = "Acme Secret Division";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const submit = (fields: Record<string, string> = { text: TEXT }) =>
  parseJobPostingAction(null, form(fields));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("PARSE_MODEL", "test-model");
  mocks.tryGetCurrentUserId.mockResolvedValue(USER);
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.requestParse.mockResolvedValue({ ok: true, output });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  consoleError.mockRestore();
});

function expectNothingSent() {
  expect(mocks.requestParse).not.toHaveBeenCalled();
}

// Every log line is exactly (message, { category, textLength }): never the
// text, the model output or an error object.
function expectOnlyLog(category: string) {
  expect(consoleError).toHaveBeenCalledTimes(1);
  expect(consoleError.mock.calls[0]).toEqual([
    LOG_MESSAGE,
    { category, textLength: TEXT.length },
  ]);
  const logged = JSON.stringify(consoleError.mock.calls);
  expect(logged).not.toContain(TEXT);
  expect(logged).not.toContain(MODEL_ONLY_VALUE);
}

describe("parseJobPostingAction before the API call (US-7)", () => {
  it("gives the generic error when the session read fails, and sends nothing", async () => {
    mocks.tryGetCurrentUserId.mockResolvedValue(null);
    await expect(submit()).resolves.toEqual({
      ok: false,
      error: { message: GENERIC },
      values: { text: TEXT },
    });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expectNothingSent();
  });

  it.each([
    ["empty", "   ", "Paste the text of a job posting"],
    [
      "too long",
      "a".repeat(20_001),
      "The text is too long (max 20,000 characters)",
    ],
  ])(
    "rejects %s text on the text field, and sends nothing",
    async (_l, text, error) => {
      await expect(submit({ text })).resolves.toEqual({
        ok: false,
        error: { fieldErrors: { text: [error] } },
        values: { text },
      });
      expect(mocks.checkRateLimit).not.toHaveBeenCalled();
      expectNothingSent();
    },
  );

  it.each(["ANTHROPIC_API_KEY", "PARSE_MODEL"])(
    "gives the generic error when %s is missing, before the limit check",
    async (name) => {
      vi.stubEnv(name, undefined);
      await expect(submit()).resolves.toEqual({
        ok: false,
        error: { message: GENERIC },
        values: { text: TEXT },
      });
      expect(mocks.checkRateLimit).not.toHaveBeenCalled();
      expectNothingSent();
      expectOnlyLog("config_missing");
    },
  );
});

describe("parseJobPostingAction rate limit (US-7)", () => {
  const atLimit = (resetAt: string) =>
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      resetAt: new Date(resetAt),
    });

  it.each([
    ["Europe/Kyiv", "2026-11-23T12:05:00Z", "14:05"],
    ["Europe/Kyiv", "2026-11-23T07:05:00Z", "09:05"],
    ["Mars/Base", "2026-11-23T12:05:00Z", "12:05"],
    [undefined, "2026-11-23T07:05:00Z", "07:05"],
  ])(
    "tells the reset time in tz %s (%s → %s), and sends nothing",
    async (tz, resetAt, time) => {
      atLimit(resetAt);
      const fields: Record<string, string> = { text: TEXT };
      if (tz !== undefined) fields.tz = tz;

      await expect(submit(fields)).resolves.toEqual({
        ok: false,
        error: {
          message: `Daily limit reached. You can parse again after ${time}.`,
        },
        values: { text: TEXT },
      });
      expect(mocks.checkRateLimit).toHaveBeenCalledWith({
        action: "parse",
        windowMs: 24 * 60 * 60 * 1000,
        counters: [{ key: USER, limit: 20 }],
        now: expect.any(Date),
      });
      expectNothingSent();
    },
  );

  it("fails closed when the limit check throws", async () => {
    mocks.checkRateLimit.mockRejectedValue(new Error(`db down ${TEXT}`));
    await expect(submit()).resolves.toEqual({
      ok: false,
      error: { message: GENERIC },
      values: { text: TEXT },
    });
    expectNothingSent();
    expectOnlyLog("rate_limit_db");
  });
});

describe("parseJobPostingAction API call (US-7)", () => {
  it("records the request before the call and returns the validated fields", async () => {
    await expect(submit()).resolves.toEqual({
      ok: true,
      data: {
        company: "Acme",
        role: "Senior Frontend Engineer",
        location: "Kyiv",
        level: "Senior",
        stack: "React, TypeScript",
        salaryMin: "50000",
        salaryMax: "70000",
        salaryCurrency: "USD",
      },
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith({
      action: "parse",
      windowMs: 24 * 60 * 60 * 1000,
      counters: [{ key: USER, limit: 20 }],
      now: expect.any(Date),
    });
    expect(mocks.requestParse).toHaveBeenCalledTimes(1);
    expect(mocks.requestParse.mock.calls[0][0]).toBe(TEXT);
    expect(mocks.checkRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requestParse.mock.invocationCallOrder[0],
    );
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("gives the 30 s budget from the moment of the call", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    // The session and database steps take time before the call.
    mocks.checkRateLimit.mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 2_000);
      return { allowed: true };
    });
    let calledAt = 0;
    mocks.requestParse.mockImplementation(async () => {
      calledAt = Date.now();
      return { ok: true, output };
    });

    await submit();

    expect(mocks.requestParse).toHaveBeenCalledTimes(1);
    const options = mocks.requestParse.mock.calls[0][1];
    expect(options.deadline).toBe(calledAt + 30_000);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.signal.aborted).toBe(false);
  });

  it("tells a non-posting apart, changes no field, and counts the request", async () => {
    mocks.requestParse.mockResolvedValue({
      ok: true,
      output: { ...output, isJobPosting: false, company: MODEL_ONLY_VALUE },
    });
    await expect(submit()).resolves.toEqual({
      ok: false,
      error: { message: NOT_POSTING },
      values: { text: TEXT },
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each(["api_bad_request", "timeout", "invalid_output", "refusal"])(
    "gives the generic error on a client failure (%s), counted once, logged without content",
    async (category) => {
      mocks.requestParse.mockResolvedValue({ ok: false, category });
      await expect(submit()).resolves.toEqual({
        ok: false,
        error: { message: GENERIC },
        values: { text: TEXT },
      });
      expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
      expectOnlyLog(category);
    },
  );
});

describe("actions module (US-7)", () => {
  it("imports without ANTHROPIC_API_KEY and PARSE_MODEL", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", undefined);
    vi.stubEnv("PARSE_MODEL", undefined);
    vi.resetModules();
    await expect(import("./actions")).resolves.toHaveProperty(
      "parseJobPostingAction",
    );
  });
});
