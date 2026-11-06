"use client";

import { useActionState, useRef } from "react";
import { deleteApplicationAction } from "../actions";

type Props = {
  id: string;
  // Shown in the confirmation, so the user sees what is being deleted.
  name: string;
};

const buttonClass =
  "rounded-md px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:outline-zinc-100";

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

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={`${buttonClass} text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950`}
      >
        Delete
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-heading"
        aria-describedby="delete-description"
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-zinc-900 backdrop:bg-black/50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <h2 id="delete-heading" className="text-lg font-semibold">
          Delete this application?
        </h2>
        <p
          id="delete-description"
          className="mt-2 text-sm break-words text-zinc-600 dark:text-zinc-400"
        >
          The application for {name} and its status history will be removed
          permanently. This can&apos;t be undone.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-3 text-sm text-red-600 dark:text-red-400"
          >
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
            className={`${buttonClass} text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className={`${buttonClass} bg-red-700 text-white hover:bg-red-600`}
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
        </form>
      </dialog>
    </>
  );
}
