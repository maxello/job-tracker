"use client";

import { useActionState, useId, useState } from "react";
import type { Status } from "@/generated/prisma/enums";
import { changeStatusAction } from "../actions";
import { STATUS_LABELS } from "../status";

type Props = {
  id: string;
  status: Status;
};

// Explicit submit button, no auto-submit on change: arrow keys on a focused
// <select> would otherwise send the form on every step.
// Render with key={status}, so the selection resets when refresh() delivers a
// new status.
export function StatusForm({ id, status }: Props) {
  const [state, formAction, pending] = useActionState(changeStatusAction, null);
  const [selected, setSelected] = useState(status);
  const failure = state?.ok === false ? state.error : undefined;
  const error = failure?.fieldErrors?.status?.[0] ?? failure?.message;
  // Unique per instance: a hidden detail page can stay in the document (#26).
  const baseId = useId();
  const selectId = `${baseId}-status`;
  const errorId = `${baseId}-error`;

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={selectId} className="text-sm font-medium">
        Status
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <select
          id={selectId}
          name="status"
          value={selected}
          onChange={(event) => setSelected(event.target.value as Status)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="min-w-0 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 aria-invalid:border-red-600 dark:border-zinc-700 dark:bg-zinc-950 dark:focus-visible:outline-zinc-100 dark:aria-invalid:border-red-400"
        >
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || selected === status}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:focus-visible:outline-zinc-100"
        >
          {pending ? "Updating…" : "Update status"}
        </button>
      </div>
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </form>
  );
}
