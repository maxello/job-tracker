"use client";

import { notFound } from "next/navigation";
import { useActionState, useId, useState } from "react";
import type { Status } from "@/generated/prisma/enums";
import { changeStatusAction } from "../actions";
import { STATUS_LABELS } from "../status";
import { inkButtonClass } from "./button-classes";
import {
  statusFormClass,
  statusLabelClass,
  statusRowClass,
  statusSelectClass,
} from "./status-form-classes";

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
    <form action={formAction} className={statusFormClass}>
      <input type="hidden" name="id" value={id} />
      <label htmlFor={selectId} className={statusLabelClass}>
        Status
      </label>
      <div className={statusRowClass}>
        <span className="field-select">
          <select
            id={selectId}
            name="status"
            value={selected}
            onChange={(event) => setSelected(event.target.value as Status)}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className={statusSelectClass}
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
          className={inkButtonClass}
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
