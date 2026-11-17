"use client";

import { notFound } from "next/navigation";
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
  // The action returns not-found instead of throwing it (the board must keep
  // its page). Thrown while rendering, it reaches the segment's not-found
  // boundary, which shows the same UI as a missing id.
  if (failure?.notFound) notFound();
  const error = failure?.fieldErrors?.status?.[0] ?? failure?.message;
  // Unique per instance: a hidden detail page can stay in the document (#26).
  const baseId = useId();
  const selectId = `${baseId}-status`;
  const errorId = `${baseId}-error`;

  return (
    // p-4 leaves room for the button's lip and 7px focus ring.
    <form
      action={formAction}
      className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-4"
    >
      <input type="hidden" name="id" value={id} />
      <label htmlFor={selectId} className="text-sm font-medium">
        Status
      </label>
      {/* items-start and h-10.5 (42px): the select spans the button's face
          (38px) plus its 4px lip, so both look the same height. */}
      <div className="flex flex-wrap items-start gap-3">
        <span className="field-select">
          <select
            id={selectId}
            name="status"
            value={selected}
            onChange={(event) => setSelected(event.target.value as Status)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className="field h-10.5 min-w-0 px-3 py-2.5 text-sm font-medium"
          >
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </span>
        <button
          type="submit"
          disabled={pending || selected === status}
          className="button-ink px-4 py-2 text-sm"
        >
          {pending ? "Updating…" : "Update status"}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
