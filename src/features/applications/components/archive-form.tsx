"use client";

import { useActionState } from "react";
import {
  archiveApplicationAction,
  unarchiveApplicationAction,
} from "../actions";

type Props = {
  id: string;
  archived: boolean;
};

// Archive and unarchive are separate actions, never a toggle: a stale tab that
// still shows "Archive" can only archive (SPEC.md decision log, 2026-11-12).
// No confirmation, because both are reversible.
export function ArchiveForm({ id, archived }: Props) {
  const [state, formAction, pending] = useActionState(
    archived ? unarchiveApplicationAction : archiveApplicationAction,
    null,
  );
  const error = state?.ok === false ? state.error.message : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:focus-visible:outline-zinc-100"
      >
        {archived
          ? pending
            ? "Unarchiving…"
            : "Unarchive"
          : pending
            ? "Archiving…"
            : "Archive"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
