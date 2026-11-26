// Sign-in and sign-up rate limits (SPEC.md US-0 "Rate limits", decision log
// 2026-11-26 "sign-in and sign-up rate limits", "client IP" and "rate-limit
// queue details").

const MINUTE_MS = 60 * 1000;

export const SIGN_IN_LIMIT = {
  action: "sign-in",
  windowMs: 15 * MINUTE_MS,
  perEmail: 5,
  perIp: 20,
} as const;

export const SIGN_UP_LIMIT = {
  action: "sign-up",
  windowMs: 60 * MINUTE_MS,
  perIp: 5,
} as const;

// The first comma-separated value of x-forwarded-for, trimmed. No header, an
// empty value or an empty first value is "unknown" (one shared counter).
export function clientIp(headers: Pick<Headers, "get">): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : "unknown";
}

// e2e raises the IP limits through E2E_AUTH_IP_LIMIT (never set in
// production, SPEC.md section 9). Anything but a positive integer is
// ignored, so a mistake never weakens a limit.
export function ipLimit(defaultLimit: number): number {
  const override = process.env.E2E_AUTH_IP_LIMIT;
  if (override === undefined || !/^[1-9]\d*$/.test(override)) {
    return defaultLimit;
  }
  return Number(override);
}

// N is the time until the count drops below the limit, in minutes, rounded
// up, at least 1.
export function tooManyAttemptsMessage(resetAt: Date, now: Date): string {
  const minutes = Math.max(
    1,
    Math.ceil((resetAt.getTime() - now.getTime()) / MINUTE_MS),
  );
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
