import type { HTMLInputAutoCompleteAttribute } from "react";

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
  const describedBy = [
    hint ? `${name}-hint` : null,
    error ? `${name}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        required
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy || undefined}
        className="w-full min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 aria-invalid:border-red-600 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:outline-zinc-100 dark:aria-invalid:border-red-400"
      />
      {hint && (
        <p
          id={`${name}-hint`}
          className="text-xs text-zinc-500 dark:text-zinc-400"
        >
          {hint}
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
