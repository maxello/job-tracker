"use client";

import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import {
  archiveApplicationAction,
  unarchiveApplicationAction,
} from "../actions";
import { quietButtonClass } from "./button-classes";

type Props = {
  id: string;
  archived: boolean;
};

// Archive and unarchive are separate actions, never a toggle: a stale tab that
// still shows "Archive" can only archive (SPEC.md decision log, 2026-11-12).
// No confirmation, because both are reversible.
// This component stays mounted across refresh(); it swaps one keyed child per
// action, and after a click on one it moves focus to the other once the new
// state arrives. A page load never takes focus.
export function ArchiveForm({ id, archived }: Props) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusAfterSwapRef = useRef(false);

  useEffect(() => {
    if (!focusAfterSwapRef.current) return;
    focusAfterSwapRef.current = false;
    buttonRef.current?.focus();
  }, [archived]);

  // Stable, so the child's effect runs once per action result, not per render.
  const callbacks = useMemo(
    () => ({
      onSubmit: () => {
        focusAfterSwapRef.current = true;
      },
      // A failure doesn't swap the form, so a later state change (e.g. from
      // another tab) must not steal focus.
      onFailure: () => {
        focusAfterSwapRef.current = false;
      },
    }),
    [],
  );

  return archived ? (
    <ArchiveButtonForm
      key="unarchive"
      id={id}
      action={unarchiveApplicationAction}
      label="Unarchive"
      pendingLabel="Unarchiving…"
      buttonRef={buttonRef}
      {...callbacks}
    />
  ) : (
    <ArchiveButtonForm
      key="archive"
      id={id}
      action={archiveApplicationAction}
      label="Archive"
      pendingLabel="Archiving…"
      buttonRef={buttonRef}
      {...callbacks}
    />
  );
}

function ArchiveButtonForm({
  id,
  action,
  label,
  pendingLabel,
  buttonRef,
  onSubmit,
  onFailure,
}: {
  id: string;
  action: typeof archiveApplicationAction;
  label: string;
  pendingLabel: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onSubmit: () => void;
  onFailure: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const error = state?.ok === false ? state.error.message : undefined;

  // Runs once per action result: each one is a new state object.
  useEffect(() => {
    if (state?.ok === false) onFailure();
  }, [state, onFailure]);

  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        ref={buttonRef}
        type="submit"
        disabled={pending}
        onClick={onSubmit}
        className={quietButtonClass}
      >
        {pending ? pendingLabel : label}
      </button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
