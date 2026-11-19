"use client";

import { useActionState, useId, useRef } from "react";
import { deleteApplicationAction } from "../actions";
import { quietButtonClass } from "./button-classes";

type Props = {
  id: string;
  // Shown in the confirmation, so the user sees what is being deleted.
  name: string;
};

// The form lives inside the closed <dialog>, which isn't displayed, so it can't
// be submitted before hydration: the trigger needs JavaScript to open it.
// Cancel comes first in the DOM, so showModal() gives it the initial focus.
export function DeleteApplication({ id, name }: Props) {
  const [state, formAction, pending] = useActionState(
    deleteApplicationAction,
    null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const error = state?.ok === false ? state.error.message : undefined;
  // Unique per instance: a hidden detail page can stay in the document, and a
  // shared id could resolve to its description of another application (#26).
  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const descriptionId = `${baseId}-description`;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={`${quietButtonClass} text-danger`}
      >
        Delete
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-surface p-6 text-text backdrop:bg-scrim"
      >
        <h2 id={headingId} className="font-display text-lg font-semibold">
          Delete this application?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm break-words text-muted">
          The application for {name} and its status history will be removed
          permanently. This can&apos;t be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <form
          action={formAction}
          className="mt-5 flex flex-wrap justify-end gap-3"
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="button"
            disabled={pending}
            onClick={() => dialogRef.current?.close()}
            className="button-quiet px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="button-danger px-4 py-2 text-sm"
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </form>
      </dialog>
    </>
  );
}
