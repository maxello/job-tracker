"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import type { ActionResult } from "@/lib/action-result";
import type { ApplicationFieldName } from "../actions";
import type { ApplicationFormValues } from "../form-values";

const CURRENCY_SUGGESTIONS = ["USD", "EUR", "UAH", "GBP", "PLN"];

const controlClass = "field w-full min-w-0 px-3 py-2 text-sm";

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
  // Unique per instance: Cache Components can keep a hidden copy of this form
  // (create or another edit page) in the document (#26).
  const idPrefix = useId();
  const fieldId = (name: string) => `${idPrefix}-${name}`;
  const currencyListId = fieldId("currency-suggestions");

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
      hint ? fieldId(`${name}-hint`) : null,
      invalid ? fieldId(`${name}-error`) : null,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      id: fieldId(name),
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
        <label htmlFor={fieldId(name)} className="text-sm font-medium">
          {label}
          {options.required && (
            <span aria-hidden="true" className="text-muted">
              {" "}
              *
            </span>
          )}
        </label>
        {input}
        {options.hint && (
          <p id={fieldId(`${name}-hint`)} className="text-xs text-muted">
            {options.hint}
          </p>
        )}
        {error && (
          <p id={fieldId(`${name}-error`)} className="text-sm text-danger">
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
      className="flex flex-col gap-5 rounded-lg border border-line bg-surface p-4 sm:p-6"
    >
      {id !== undefined && <input type="hidden" name="id" value={id} />}

      <p className="text-sm text-muted">
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
        <legend className="mb-2 font-display text-sm font-semibold">
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
              list={currencyListId}
              maxLength={3}
              autoCapitalize="characters"
              placeholder="USD"
              {...control("salaryCurrency")}
            />,
          )}
        </div>
        <datalist id={currencyListId}>
          {CURRENCY_SUGGESTIONS.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>
      </fieldset>

      {field("notes", "Notes", <textarea rows={5} {...control("notes")} />)}

      {failure?.error.message && (
        <p
          role="alert"
          className="rounded-md border border-l-6 border-line border-l-danger bg-surface px-3 py-2 text-sm"
        >
          {failure.error.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="button-ink px-4 py-2 text-sm"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href={cancelHref} className="button-quiet px-4 py-2 text-sm">
          Cancel
        </Link>
      </div>
    </form>
  );
}
