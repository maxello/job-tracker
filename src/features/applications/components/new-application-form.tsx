import { getCurrentUserId } from "@/lib/current-user";
import { createApplicationAction } from "../actions";
import { ApplicationForm } from "./application-form";
import {
  actionsClass,
  controlClass,
  fieldClass,
  fieldsetClass,
  formCardClass,
  hintClass,
  labelClass,
  legendClass,
  pairGridClass,
  requiredMarkClass,
  requiredNoteClass,
  salaryGridClass,
} from "./application-form-classes";
import { inkButtonClass, quietButtonClass } from "./button-classes";

// The form itself holds no user data, but the page must still validate the
// session: the proxy only checks that a cookie exists. Reads the session, so it
// must render inside <Suspense>.
export async function NewApplicationForm() {
  await getCurrentUserId();
  return (
    <ApplicationForm
      action={createApplicationAction}
      submitLabel="Save application"
      cancelHref="/"
    />
  );
}

const pulse = "animate-pulse rounded bg-line";

type Mode = "new" | "edit";

// A field as the form draws it: the label (with " *" when required), the
// control's box and the hint. The value is data on the edit form, so it
// pulses there; the new form shows only the static placeholder, in the
// placeholder colour (`field` sets the box's colour, so it goes on the inner
// span).
function FakeField({
  slug,
  label,
  mode,
  required = false,
  placeholder,
  hint,
  textarea = false,
}: {
  slug: string;
  label: string;
  mode: Mode;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  textarea?: boolean;
}) {
  // One text-sm line (20px), or the textarea's five (rows={5}).
  const height = textarea ? "h-25" : "h-5";
  return (
    <div className={fieldClass}>
      <span data-skeleton={`label-${slug}`} className={labelClass}>
        {label}
        {required && <span className={requiredMarkClass}>{" *"}</span>}
      </span>
      <span
        data-skeleton={`control-${slug}`}
        className={`block ${controlClass} pointer-events-none`}
      >
        {mode === "edit" ? (
          <span className={`block ${height}`}>
            <span className={`block h-5 ${pulse}`} />
          </span>
        ) : (
          <span className={`block ${height} text-muted`}>{placeholder}</span>
        )}
      </span>
      {hint && (
        <p data-skeleton="hint" className={hintClass}>
          {hint}
        </p>
      )}
    </div>
  );
}

// The form's boxes with the form's classes, for the new and the edit page
// (SPEC.md decision log, 2026-11-19): every label, the required note, the
// hint, the legend and the buttons are visible real text. Fake controls are
// spans: no label, no id, nothing focusable. The visual root is aria-hidden;
// screen readers get the sr-only line before it. The data-skeleton hooks let
// e2e/skeleton-layout.spec.ts compare positions.
export function NewApplicationFormSkeleton({ mode }: { mode: Mode }) {
  return (
    <div>
      <span className="sr-only">Loading form</span>
      <div aria-hidden="true" data-skeleton="form" className={formCardClass}>
        <p data-skeleton="required-note" className={requiredNoteClass}>
          Fields marked * are required.
        </p>
        <div className={pairGridClass}>
          <FakeField slug="company" label="Company" mode={mode} required />
          <FakeField slug="role" label="Role" mode={mode} required />
        </div>
        <FakeField
          slug="url"
          label="Job URL"
          mode={mode}
          placeholder="https://"
        />
        <div className={pairGridClass}>
          <FakeField slug="location" label="Location" mode={mode} />
          <FakeField slug="level" label="Level" mode={mode} />
        </div>
        <FakeField
          slug="stack"
          label="Stack"
          mode={mode}
          hint="Comma-separated, e.g. React, Node"
        />
        <fieldset className={fieldsetClass}>
          <legend data-skeleton="legend" className={legendClass}>
            Salary (annual gross)
          </legend>
          <div className={salaryGridClass}>
            <FakeField slug="salary-min" label="Min" mode={mode} />
            <FakeField slug="salary-max" label="Max" mode={mode} />
            <FakeField
              slug="currency"
              label="Currency"
              mode={mode}
              placeholder="USD"
            />
          </div>
        </fieldset>
        <FakeField slug="notes" label="Notes" mode={mode} textarea />
        {/* Not interactive: no pointer, no hover. */}
        <div className={actionsClass}>
          <span
            data-skeleton="save"
            className={`${inkButtonClass} pointer-events-none`}
          >
            {mode === "edit" ? "Save changes" : "Save application"}
          </span>
          <span
            data-skeleton="cancel"
            className={`${quietButtonClass} pointer-events-none`}
          >
            Cancel
          </span>
        </div>
      </div>
    </div>
  );
}
