import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, ipLimit, tooManyAttemptsMessage } from "./limits";

// SPEC.md US-0 "Rate limits", decision log 2026-11-26 "client IP" and
// "rate-limit queue details".

describe("clientIp (US-0, decision log 2026-11-26 client IP)", () => {
  const withHeader = (value: string) =>
    new Headers({ "x-forwarded-for": value });

  it.each([
    ["one value", "203.0.113.7", "203.0.113.7"],
    ["the first of a list", "203.0.113.7, 10.0.0.1", "203.0.113.7"],
    ["trimmed", "  203.0.113.7  , 10.0.0.1", "203.0.113.7"],
    ["an empty value is unknown", "", "unknown"],
    ["a blank value is unknown", "   ", "unknown"],
    ["an empty first value is unknown", " , 1.2.3.4", "unknown"],
  ])("%s", (_, header, expected) => {
    expect(clientIp(withHeader(header))).toBe(expected);
  });

  it("no header is unknown", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("ipLimit (US-0 e2e override)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is the default without E2E_AUTH_IP_LIMIT", () => {
    vi.stubEnv("E2E_AUTH_IP_LIMIT", undefined);
    expect(ipLimit(20)).toBe(20);
  });

  it("is the override when it is a positive integer", () => {
    vi.stubEnv("E2E_AUTH_IP_LIMIT", "1000");
    expect(ipLimit(20)).toBe(1000);
    expect(ipLimit(5)).toBe(1000);
  });

  it.each(["abc", "0", "-5", "1.5", "", " 10", "1e3"])(
    "ignores %j and keeps the default",
    (value) => {
      vi.stubEnv("E2E_AUTH_IP_LIMIT", value);
      expect(ipLimit(20)).toBe(20);
    },
  );
});

describe("tooManyAttemptsMessage (US-0)", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const after = (ms: number) => new Date(now.getTime() + ms);
  const SECOND = 1_000;
  const MINUTE = 60 * SECOND;

  it.each([
    ["15 min", 15 * MINUTE, "Too many attempts. Try again in 15 minutes."],
    [
      "14 min 1 s, rounded up",
      14 * MINUTE + SECOND,
      "Too many attempts. Try again in 15 minutes.",
    ],
    [
      "61 s, rounded up",
      61 * SECOND,
      "Too many attempts. Try again in 2 minutes.",
    ],
    ["60 s, singular", MINUTE, "Too many attempts. Try again in 1 minute."],
    [
      "30 s, at least 1",
      30 * SECOND,
      "Too many attempts. Try again in 1 minute.",
    ],
    ["0, at least 1", 0, "Too many attempts. Try again in 1 minute."],
    [
      "in the past, at least 1",
      -5 * SECOND,
      "Too many attempts. Try again in 1 minute.",
    ],
  ])("%s", (_, ms, expected) => {
    expect(tooManyAttemptsMessage(after(ms), now)).toBe(expected);
  });
});
