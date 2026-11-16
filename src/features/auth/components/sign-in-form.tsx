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
      className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 sm:p-6"
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
          className="rounded-md border border-l-6 border-line border-l-danger bg-surface px-3 py-2 text-sm"
        >
          {failure.error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="button-ink w-full px-4 py-2 text-sm"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
