"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { signInSchema, signUpSchema } from "./schemas";

export type AuthFieldName = "name" | "email" | "password";

export type AuthFormState = {
  // Sent back so the form keeps them after an error. Never the password.
  values: Partial<Record<"name" | "email", string>>;
  fieldErrors: Partial<Record<AuthFieldName, string[]>>;
  // A failure that doesn't belong to one field.
  message?: string;
};

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
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = readString(formData, "name");
  const email = readString(formData, "email");
  const values = { name, email };

  const result = signUpSchema.safeParse({
    name,
    email,
    password: readString(formData, "password"),
  });
  if (!result.success) {
    return { values, fieldErrors: z.flattenError(result.error).fieldErrors };
  }

  try {
    await auth.api.signUpEmail({
      body: result.data,
      headers: await headers(),
    });
  } catch (error) {
    if (hasErrorCode(error, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")) {
      return {
        values,
        fieldErrors: { email: ["This email is already registered"] },
      };
    }
    console.error("Failed to sign up", error);
    return {
      values,
      fieldErrors: {},
      message: "Couldn't create the account. Please try again.",
    };
  }

  // redirect throws, so it stays outside the try/catch.
  redirect("/");
}

export async function signInAction(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = readString(formData, "email");
  const values = { email };

  const result = signInSchema.safeParse({
    email,
    password: readString(formData, "password"),
  });
  if (!result.success) {
    return { values, fieldErrors: z.flattenError(result.error).fieldErrors };
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
        values,
        fieldErrors: {},
        message: "Invalid email or password.",
      };
    }
    console.error("Failed to sign in", error);
    return {
      values,
      fieldErrors: {},
      message: "Couldn't sign in. Please try again.",
    };
  }

  redirect("/");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
