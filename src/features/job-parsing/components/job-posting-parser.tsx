"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  actionsClass,
  controlClass,
  fieldClass,
  formCardClass,
  hintClass,
  labelClass,
} from "@/features/applications/components/application-form-classes";
import {
  inkButtonClass,
  quietButtonClass,
} from "@/features/applications/components/button-classes";
import { TimeZoneInput } from "@/features/applications/components/time-zone-input";
import { parseJobPostingAction } from "../actions";
import { fillParsedFields, hasParsedValue } from "../form-fill";

type ParseState = Awaited<ReturnType<typeof parseJobPostingAction>>;

// false on the server and during hydration, true after: Parse stays disabled
// until then, because a native submit would put the text in a GET URL.
const subscribe = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

// "Paste a job posting" above the new-application form (US-7, SPEC.md
// decision log, "parse UI details"). `children` is the form: the parse
// result is written into its inputs by name, inside this wrapper only, so a
// hidden copy of the page kept by <Activity> is never touched. The form's
// inputs stay uncontrolled.
export function JobPostingParser({ children }: { children: ReactNode }) {
  const [state, formAction, pending] = useActionState(
    parseJobPostingAction,
    null,
  );
  const hydrated = useSyncExternalStore(
    subscribe,
    hydratedSnapshot,
    serverSnapshot,
  );
  // Set when <Activity> hides the page, cleared by the next submit: the
  // message is cleared on return, and a result that first arrives while
  // hidden is dropped.
  const [hidden, setHidden] = useState(false);
  // The result that was on screen when the page was hidden: the next submit
  // records it, so it stays cleared while that parse runs. The next result is
  // a new object, so it shows.
  const [dismissed, setDismissed] = useState<ParseState | null>(null);
  // Effects re-run on every re-show: each result is handled once.
  const handledRef = useRef<ParseState | null>(null);
  // The submit that waits for the confirmation.
  const pendingDataRef = useRef<FormData | null>(null);

  const scopeRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const baseId = useId();
  const headingId = `${baseId}-heading`;
  const textId = `${baseId}-text`;
  const errorId = `${baseId}-error`;
  const noticeId = `${baseId}-notice`;
  const dialogHeadingId = `${baseId}-dialog-heading`;
  const dialogDescriptionId = `${baseId}-dialog-description`;

  const shown =
    hidden || state === dismissed || state?.ok !== false
      ? undefined
      : state.error;
  const textError = shown?.fieldErrors?.text?.[0];
  const message = shown?.message;

  function field(name: string) {
    return scopeRef.current?.querySelector<HTMLInputElement>(
      `[name="${name}"]`,
    );
  }

  useLayoutEffect(() => () => setHidden(true), []);

  useEffect(() => {
    if (state === null || state === handledRef.current) return;
    handledRef.current = state;
    if (hidden) return;
    if (state.ok) {
      fillParsedFields((name, value) => {
        const input = field(name);
        if (input) input.value = value;
      }, state.data);
      field("company")?.focus();
    } else if (state.error.fieldErrors?.text?.length) {
      textareaRef.current?.focus();
    } else {
      buttonRef.current?.focus();
    }
  }, [state, hidden]);

  function send(formData: FormData) {
    if (hidden) setDismissed(state);
    setHidden(false);
    startTransition(() => formAction(formData));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // No form action: React would reset the form and clear the text.
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (hasParsedValue((name) => field(name)?.value ?? "")) {
      pendingDataRef.current = formData;
      dialogRef.current?.showModal();
      return;
    }
    send(formData);
  }

  function confirm() {
    const formData = pendingDataRef.current;
    pendingDataRef.current = null;
    dialogRef.current?.close();
    if (formData) send(formData);
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby={headingId} className={formCardClass}>
        <h2 id={headingId} className="font-display text-lg font-semibold">
          Paste a job posting
        </h2>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-5"
        >
          <div className={fieldClass}>
            <label htmlFor={textId} className={labelClass}>
              Job posting
            </label>
            <textarea
              ref={textareaRef}
              id={textId}
              name="text"
              rows={8}
              aria-invalid={Boolean(textError)}
              aria-describedby={textError ? `${errorId} ${noticeId}` : noticeId}
              className={controlClass}
            />
            {textError && (
              <p id={errorId} className="text-sm text-danger">
                {textError}
              </p>
            )}
            <p id={noticeId} className={hintClass}>
              The text is sent to Anthropic&apos;s Claude API to fill in the
              form. This app doesn&apos;t store it.
            </p>
          </div>
          <TimeZoneInput />
          {message && (
            <p
              role="alert"
              className="rounded-md border border-l-6 border-line border-l-danger bg-surface px-3 py-2 text-sm"
            >
              {message}
            </p>
          )}
          <div className={actionsClass}>
            <button
              ref={buttonRef}
              type="submit"
              disabled={!hydrated || pending}
              className={quietButtonClass}
            >
              {pending ? "Parsing…" : "Parse"}
            </button>
          </div>
        </form>
      </section>

      <dialog
        ref={dialogRef}
        aria-labelledby={dialogHeadingId}
        aria-describedby={dialogDescriptionId}
        onClose={() => {
          pendingDataRef.current = null;
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-line bg-surface p-6 text-text backdrop:bg-scrim"
      >
        <h2 id={dialogHeadingId} className="font-display text-lg font-semibold">
          Replace the filled-in fields?
        </h2>
        <p id={dialogDescriptionId} className="mt-2 text-sm text-muted">
          Parsing replaces Company, Role, Location, Level, Stack and Salary with
          what the posting says. Job URL and Notes stay as they are.
        </p>
        {/* Cancel first: showModal() gives it the initial focus. */}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className={quietButtonClass}
          >
            Cancel
          </button>
          <button type="button" onClick={confirm} className={inkButtonClass}>
            Replace fields
          </button>
        </div>
      </dialog>

      <div ref={scopeRef}>{children}</div>
    </div>
  );
}
