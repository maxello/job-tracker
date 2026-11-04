"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { auth } from "@/lib/auth";
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

  try {
    await auth.api.signUpEmail({
      body: result.data,
      headers: await headers(),
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
    return {
      ok: false,
      error: { message: "Couldn't create the account. Please try again." },
      values,
    };
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

  try {
    await auth.api.signInEmail({
      body: result.data,
      headers: await headers(),
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
    return {
      ok: false,
      error: { message: "Couldn't sign in. Please try again." },
      values,
    };
  }

  redirect("/");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
