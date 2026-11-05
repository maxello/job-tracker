"use client";

import { useActionState, useEffect, useRef } from "react";
import { signUpAction } from "../actions";
import { PASSWORD_MIN_LENGTH } from "../schemas";
import { AuthField } from "./auth-field";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, null);
  const failure = state?.ok === false ? state : undefined;
  const formRef = useRef<HTMLFormElement>(null);

  // After a failed submit, move focus to the first invalid field.
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      // Validation runs on the server only; the browser must not block submit.
      noValidate
      className="flex flex-col gap-5"
    >
      <AuthField
        name="name"
        label="Name"
        type="text"
        autoComplete="name"
        defaultValue={failure?.values?.name}
        error={failure?.error.fieldErrors?.name?.[0]}
      />
      <AuthField
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={failure?.values?.email}
        error={failure?.error.fieldErrors?.email?.[0]}
      />
      <AuthField
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
        error={failure?.error.fieldErrors?.password?.[0]}
      />

      {failure?.error.message && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {failure.error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-100"
      >
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
