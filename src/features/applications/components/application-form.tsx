"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionResult } from "@/lib/action-result";
import type { ApplicationFieldName } from "../actions";
import type { ApplicationFormValues } from "../form-values";

const CURRENCY_SUGGESTIONS = ["USD", "EUR", "UAH", "GBP", "PLN"];

const controlClass =
  "w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 aria-invalid:border-red-600 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:outline-zinc-100 dark:aria-invalid:border-red-400";

type FormResult = ActionResult<never, ApplicationFieldName>;

type Props = {
  action: (prev: FormResult | null, formData: FormData) => Promise<FormResult>;
  // Edit only: the application being edited and its stored values.
  id?: string;
  initialValues?: ApplicationFormValues;
  submitLabel: string;
  cancelHref: string;
};

export function ApplicationForm({
  action,
  id,
  initialValues,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const failure = state?.ok === false ? state : undefined;
  const formRef = useRef<HTMLFormElement>(null);

  // After a failed submit, move focus to the first invalid field.
  useEffect(() => {
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [state]);

  // Shared props for every control: id/name, the value to restore after an
  // error, and the error/hint wiring for assistive technology.
  function control(name: ApplicationFieldName, hint = false) {
    const invalid = Boolean(failure?.error.fieldErrors?.[name]?.length);
    const describedBy = [
      hint ? `${name}-hint` : null,
      invalid ? `${name}-error` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      id: name,
      name,
      // ??, so a field cleared by the user stays empty after an error elsewhere.
      defaultValue: failure?.values?.[name] ?? initialValues?.[name] ?? "",
      "aria-invalid": invalid,
      "aria-describedby": describedBy || undefined,
      className: controlClass,
    };
  }

  function field(
    name: ApplicationFieldName,
    label: string,
    input: ReactNode,
    options: { required?: boolean; hint?: string } = {},
  ) {
    const error = failure?.error.fieldErrors?.[name]?.[0];
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={name} className="text-sm font-medium">
          {label}
          {options.required && (
            <span aria-hidden="true" className="text-red-600 dark:text-red-400">
              {" "}
              *
            </span>
          )}
        </label>
        {input}
        {options.hint && (
          <p
            id={`${name}-hint`}
            className="text-xs text-zinc-500 dark:text-zinc-400"
          >
            {options.hint}
          </p>
        )}
        {error && (
          <p
            id={`${name}-error`}
            className="text-sm text-red-600 dark:text-red-400"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      // Validation runs on the server only; the browser must not block submit.
      noValidate
      className="flex flex-col gap-5"
    >
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Fields marked <span aria-hidden="true">*</span>
        <span className="sr-only">as required</span> are required.
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "company",
          "Company",
          <input
            type="text"
            required
            autoComplete="off"
            {...control("company")}
          />,
          { required: true },
        )}
        {field(
          "role",
          "Role",
          <input
            type="text"
            required
            autoComplete="off"
            {...control("role")}
          />,
          { required: true },
        )}
      </div>

      {field(
        "url",
        "Job URL",
        <input type="url" placeholder="https://" {...control("url")} />,
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {field(
          "location",
          "Location",
          <input type="text" {...control("location")} />,
        )}
        {field("level", "Level", <input type="text" {...control("level")} />)}
      </div>

      {field(
        "stack",
        "Stack",
        <input type="text" {...control("stack", true)} />,
        { hint: "Comma-separated, e.g. React, Node" },
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          Salary (annual gross)
        </legend>
        <div className="grid gap-5 sm:grid-cols-3">
          {field(
            "salaryMin",
            "Min",
            <input type="text" inputMode="numeric" {...control("salaryMin")} />,
          )}
          {field(
            "salaryMax",
            "Max",
            <input type="text" inputMode="numeric" {...control("salaryMax")} />,
          )}
          {field(
            "salaryCurrency",
            "Currency",
            <input
              type="text"
              list="currency-suggestions"
              maxLength={3}
              autoCapitalize="characters"
              placeholder="USD"
              {...control("salaryCurrency")}
            />,
          )}
        </div>
        <datalist id="currency-suggestions">
          {CURRENCY_SUGGESTIONS.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>
      </fieldset>

      {field("notes", "Notes", <textarea rows={5} {...control("notes")} />)}

      {failure?.error.message && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          {failure.error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-100"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link
          href={cancelHref}
          className="rounded-md px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
