"use client";

import { useId, type HTMLInputAutoCompleteAttribute } from "react";

type Props = {
  name: string;
  label: string;
  type: "text" | "email" | "password";
  autoComplete: HTMLInputAutoCompleteAttribute;
  defaultValue?: string;
  hint?: string;
  error?: string;
};

export function AuthField({
  name,
  label,
  type,
  autoComplete,
  defaultValue,
  hint,
  error,
}: Props) {
  // Unique per instance: sign-in and sign-up share field names, and a hidden
  // copy of the other page can stay in the document (#26).
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className="field w-full min-w-0 px-3 py-2 text-sm"
      />
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
