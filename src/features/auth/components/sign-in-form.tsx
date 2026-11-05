"use client";

import { useActionState, useEffect, useRef } from "react";
import { signInAction } from "../actions";
import { AuthField } from "./auth-field";

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, null);
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
        autoComplete="current-password"
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
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
