// What every Server Action with form state returns. T is the success data, F the
// fields that can carry errors, V the fields sent back so the form keeps them.
// Actions that end in redirect() use T = never: they only return failures.
// useActionState starts from null: nothing has been submitted yet.

export type ActionError<F extends string> = {
  // A failure that doesn't belong to one field.
  message?: string;
  fieldErrors?: Partial<Record<F, string[]>>;
  // The record is missing or another user's. Only for actions whose callers
  // must not get notFound() (the status change: the board would be replaced
  // by the not-found UI, SPEC.md decision log, 2026-11-17).
  notFound?: true;
};

export type ActionResult<T, F extends string = never, V extends string = F> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError<F>; values?: Partial<Record<V, string>> };
