import { APIError } from "better-auth/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signInAction, signUpAction } from "./actions";

// Sign-in and sign-up rate limits (SPEC.md US-0 "Rate limits", decision log
// 2026-11-26).

const mocks = vi.hoisted(() => {
  class RateLimitBusyError extends Error {}
  return {
    signInEmail: vi.fn(),
    signUpEmail: vi.fn(),
    checkRateLimit: vi.fn(),
    headers: vi.fn(),
    RateLimitBusyError,
  };
});

vi.mock("@/lib/auth", () => ({
  auth: {
    api: { signInEmail: mocks.signInEmail, signUpEmail: mocks.signUpEmail },
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  RateLimitBusyError: mocks.RateLimitBusyError,
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const MINUTE = 60_000;
const IP = "203.0.113.7";
const RAW_EMAIL = " User@Example.COM ";
const EMAIL = "user@example.com";
const PASSWORD = "correct horse battery";
const NAME = "Test User";
const SIGN_IN_FAILED = "Couldn't sign in. Please try again.";
const SIGN_UP_FAILED = "Couldn't create the account. Please try again.";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const signIn = (fields = { email: RAW_EMAIL, password: PASSWORD }) =>
  signInAction(null, form(fields));
const signUp = (
  fields = { name: NAME, email: RAW_EMAIL, password: PASSWORD },
) => signUpAction(null, form(fields));

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("E2E_AUTH_IP_LIMIT", undefined);
  mocks.headers.mockResolvedValue(
    new Headers({ "x-forwarded-for": `${IP}, 10.0.0.1` }),
  );
  mocks.checkRateLimit.mockResolvedValue({ allowed: true });
  mocks.signInEmail.mockResolvedValue({});
  mocks.signUpEmail.mockResolvedValue({});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  consoleError.mockRestore();
});

// The only log line is (message, { category }): never the email, the IP or
// an error object.
function expectOnlyLog(message: string, category: string) {
  expect(consoleError).toHaveBeenCalledTimes(1);
  expect(consoleError.mock.calls[0]).toEqual([message, { category }]);
  for (const arg of consoleError.mock.calls[0]) {
    expect(arg).not.toBeInstanceOf(Error);
  }
  const logged = JSON.stringify(consoleError.mock.calls);
  expect(logged.toLowerCase()).not.toContain(EMAIL);
  expect(logged).not.toContain(IP);
}

describe("signInAction rate limit (US-0)", () => {
  it("checks the validated email (5) and the client IP (20) in 15 minutes, before auth.api", async () => {
    await expect(signIn()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith({
      action: "sign-in",
      windowMs: 15 * MINUTE,
      counters: [
        { key: EMAIL, limit: 5 },
        { key: IP, limit: 20 },
      ],
      now: expect.any(Date),
    });
    expect(mocks.signInEmail).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signInEmail.mock.invocationCallOrder[0],
    );
  });

  it("doesn't check the limit when the form is invalid", async () => {
    await expect(
      signIn({ email: "not-an-email", password: PASSWORD }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("at the limit, shows the message and doesn't call auth.api", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      resetAt: new Date(Date.now() + 15 * MINUTE),
    });
    await expect(signIn()).resolves.toEqual({
      ok: false,
      error: { message: "Too many attempts. Try again in 15 minutes." },
      values: { email: RAW_EMAIL },
    });
    expect(mocks.signInEmail).not.toHaveBeenCalled();
  });

  it("counts N from the time after the check, not before it", async () => {
    const before = new Date("2026-11-26T12:00:00Z");
    vi.useFakeTimers({ now: before });
    mocks.checkRateLimit.mockImplementation(async () => {
      // The check took 3 s (a queue wait).
      vi.setSystemTime(before.getTime() + 3_000);
      // 15 min 2 s after `before` (16 minutes from it), 14 min 59 s after
      // the check returned.
      return {
        allowed: false,
        resetAt: new Date(before.getTime() + 15 * MINUTE + 2_000),
      };
    });
    await expect(signIn()).resolves.toMatchObject({
      error: { message: "Too many attempts. Try again in 15 minutes." },
    });
  });

  it("fails closed on a queue rejection, logged as rate_limit_queue", async () => {
    mocks.checkRateLimit.mockRejectedValue(
      new mocks.RateLimitBusyError(`busy ${EMAIL} ${IP}`),
    );
    await expect(signIn()).resolves.toEqual({
      ok: false,
      error: { message: SIGN_IN_FAILED },
      values: { email: RAW_EMAIL },
    });
    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expectOnlyLog("Sign-in rate limit failed", "rate_limit_queue");
  });

  it("fails closed on a database error, logged as rate_limit_db", async () => {
    mocks.checkRateLimit.mockRejectedValue(new Error(`db down ${EMAIL} ${IP}`));
    await expect(signIn()).resolves.toEqual({
      ok: false,
      error: { message: SIGN_IN_FAILED },
      values: { email: RAW_EMAIL },
    });
    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expectOnlyLog("Sign-in rate limit failed", "rate_limit_db");
  });

  it("raises only the IP limit with E2E_AUTH_IP_LIMIT", async () => {
    vi.stubEnv("E2E_AUTH_IP_LIMIT", "1000");
    await expect(signIn()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        counters: [
          { key: EMAIL, limit: 5 },
          { key: IP, limit: 1000 },
        ],
      }),
    );
  });

  it("keys the IP counter as unknown without x-forwarded-for", async () => {
    mocks.headers.mockResolvedValue(new Headers());
    await expect(signIn()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        counters: [
          { key: EMAIL, limit: 5 },
          { key: "unknown", limit: 20 },
        ],
      }),
    );
  });

  it("counts a wrong password: the check runs, then the credentials error", async () => {
    mocks.signInEmail.mockRejectedValue(
      new APIError("UNAUTHORIZED", {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      }),
    );
    await expect(signIn()).resolves.toEqual({
      ok: false,
      error: { message: "Invalid email or password." },
      values: { email: RAW_EMAIL },
    });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
  });
});

describe("signUpAction rate limit (US-0)", () => {
  it("checks the client IP (5) in 1 hour, before auth.api", async () => {
    await expect(signUp()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith({
      action: "sign-up",
      windowMs: 60 * MINUTE,
      counters: [{ key: IP, limit: 5 }],
      now: expect.any(Date),
    });
    expect(mocks.signUpEmail).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signUpEmail.mock.invocationCallOrder[0],
    );
  });

  it("doesn't check the limit when the form is invalid", async () => {
    await expect(
      signUp({ name: "", email: RAW_EMAIL, password: PASSWORD }),
    ).resolves.toMatchObject({ ok: false });
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it("at the limit, shows the message, keeps name and email, not the password", async () => {
    mocks.checkRateLimit.mockResolvedValue({
      allowed: false,
      resetAt: new Date(Date.now() + 60 * MINUTE),
    });
    await expect(signUp()).resolves.toEqual({
      ok: false,
      error: { message: "Too many attempts. Try again in 60 minutes." },
      values: { name: NAME, email: RAW_EMAIL },
    });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
  });

  it.each([
    [
      "a queue rejection",
      "rate_limit_queue",
      () => new mocks.RateLimitBusyError(`busy ${IP}`),
    ],
    [
      "a database error",
      "rate_limit_db",
      () => new Error(`db down ${EMAIL} ${IP}`),
    ],
  ])("fails closed on %s, logged as %s", async (_, category, makeError) => {
    mocks.checkRateLimit.mockRejectedValue(makeError());
    await expect(signUp()).resolves.toEqual({
      ok: false,
      error: { message: SIGN_UP_FAILED },
      values: { name: NAME, email: RAW_EMAIL },
    });
    expect(mocks.signUpEmail).not.toHaveBeenCalled();
    expectOnlyLog("Sign-up rate limit failed", category);
  });

  it("raises the IP limit with E2E_AUTH_IP_LIMIT", async () => {
    vi.stubEnv("E2E_AUTH_IP_LIMIT", "1000");
    await expect(signUp()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ counters: [{ key: IP, limit: 1000 }] }),
    );
  });
});
