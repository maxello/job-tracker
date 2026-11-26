"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
import {
  checkRateLimit,
  RateLimitBusyError,
  type RateLimitCounter,
} from "@/lib/rate-limit";
import {
  clientIp,
  ipLimit,
  SIGN_IN_LIMIT,
  SIGN_UP_LIMIT,
  tooManyAttemptsMessage,
} from "./limits";
import { signInSchema, signUpSchema } from "./schemas";

export type AuthFieldName = "name" | "email" | "password";

// The values type leaves out the password, so it can't be sent back to the form.
type SignUpResult = ActionResult<never, AuthFieldName, "name" | "email">;
type SignInResult = ActionResult<never, AuthFieldName, "email">;

function readString(formData: FormData, name: AuthFieldName) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

// Matches on the error code, not the status: Better Auth also uses 422 for a
// failed user insert and 401 for a failed session insert.
function hasErrorCode(error: unknown, code: string) {
  return isAPIError(error) && error.body?.code === code;
}

const SIGN_UP_FAILED = "Couldn't create the account. Please try again.";
const SIGN_IN_FAILED = "Couldn't sign in. Please try again.";

// Checks and records the attempt before auth.api (SPEC.md US-0). Returns the
// message to show when the attempt can't go on, or null. Fails closed: any
// error gives `failedMessage`, logged with only its category (never the
// email, the IP or the error).
async function rateLimitMessage(
  label: string,
  failedMessage: string,
  check: { action: string; windowMs: number; counters: RateLimitCounter[] },
): Promise<string | null> {
  try {
    const limit = await checkRateLimit({ ...check, now: new Date() });
    if (limit.allowed) return null;
    // N from the time after the check: it can have waited in the queue.
    return tooManyAttemptsMessage(limit.resetAt, new Date());
  } catch (error) {
    const category =
      error instanceof RateLimitBusyError
        ? "rate_limit_queue"
        : "rate_limit_db";
    console.error(`${label} rate limit failed`, { category });
    return failedMessage;
  }
}

export async function signUpAction(
  _prevState: SignUpResult | null,
  formData: FormData,
): Promise<SignUpResult> {
  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const values = { name, email };

  const result = signUpSchema.safeParse({
    name,
    email,
    password: readString(formData, "password"),
  });
  if (!result.success) {
    return {
      ok: false,
      error: { fieldErrors: z.flattenError(result.error).fieldErrors },
      values,
    };
  }

  const requestHeaders = await headers();
  const limited = await rateLimitMessage("Sign-up", SIGN_UP_FAILED, {
    action: SIGN_UP_LIMIT.action,
    windowMs: SIGN_UP_LIMIT.windowMs,
    counters: [
      { key: clientIp(requestHeaders), limit: ipLimit(SIGN_UP_LIMIT.perIp) },
    ],
  });
  if (limited) return { ok: false, error: { message: limited }, values };

  try {
    await auth.api.signUpEmail({
      body: result.data,
      headers: requestHeaders,
    });
  } catch (error) {
    if (hasErrorCode(error, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")) {
      return {
        ok: false,
        error: { fieldErrors: { email: ["This email is already registered"] } },
        values,
      };
    }
    console.error("Failed to sign up", error);
    return { ok: false, error: { message: SIGN_UP_FAILED }, values };
  }

  // redirect throws, so it stays outside the try/catch.
  redirect("/");
}

export async function signInAction(
  _prevState: SignInResult | null,
  formData: FormData,
): Promise<SignInResult> {
  const email = readString(formData, "email");
  const values = { email };

  const result = signInSchema.safeParse({
    email,
    password: readString(formData, "password"),
  });
  if (!result.success) {
    return {
      ok: false,
      error: { fieldErrors: z.flattenError(result.error).fieldErrors },
      values,
    };
  }

  const requestHeaders = await headers();
  const limited = await rateLimitMessage("Sign-in", SIGN_IN_FAILED, {
    action: SIGN_IN_LIMIT.action,
    windowMs: SIGN_IN_LIMIT.windowMs,
    counters: [
      // The validated email (trimmed and lowercased), not the raw value.
      { key: result.data.email, limit: SIGN_IN_LIMIT.perEmail },
      { key: clientIp(requestHeaders), limit: ipLimit(SIGN_IN_LIMIT.perIp) },
    ],
  });
  if (limited) return { ok: false, error: { message: limited }, values };

  try {
    await auth.api.signInEmail({
      body: result.data,
      headers: requestHeaders,
    });
  } catch (error) {
    // The same text for an unknown email and a wrong password.
    if (hasErrorCode(error, "INVALID_EMAIL_OR_PASSWORD")) {
      return {
        ok: false,
        error: { message: "Invalid email or password." },
        values,
      };
    }
    console.error("Failed to sign in", error);
    return { ok: false, error: { message: SIGN_IN_FAILED }, values };
  }

  redirect("/");
}

// No form state: a failure is unexpected, so it is rethrown to the error boundary.
// Better Auth catches its own database errors here and still clears the cookie,
// so this catches only failures outside those.
export async function signOutAction() {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    console.error("Failed to sign out", error);
    throw error;
  }

  // redirect throws, so it stays outside the try/catch.
  redirect("/sign-in");
}
