import Form from "next/form";
import Link from "next/link";
import { Status } from "@/generated/prisma/enums";
import { SHOW_ARCHIVED_VALUE } from "../archived-filter";
import { STATUS_LABELS } from "../status";
import { STATUS_STYLES } from "../status-style";
import { statusFilterValue } from "../status-filter";

// GET form to `/`: the checked boxes become repeated `status` keys, and "Show
// archived" adds `archived=1` (US-8).
// Checkboxes use defaultChecked, so the wrapper is keyed on the selection to
// re-mount the form after Back, Forward or Clear (`<Form>` with a string
// action doesn't support `key`). See the SPEC.md decision log, 2026-11-11.
// Two fieldsets, each named by its legend on the border: "Status" and
// "Archive", so "Show archived" isn't announced as a status. Clear and Apply
// follow them (SPEC.md decision log, 2026-11-12). Below `lg` the fieldsets sit
// side by side; from `lg` they stack in the list's left column, one checkbox
// per line (2026-11-13). The column and its spacing come from ApplicationList.
const fieldsetClass =
  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 lg:flex-col lg:items-start";

export function StatusFilterForm({
  selected,
  showArchived,
}: {
  selected: Status[];
  showArchived: boolean;
}) {
  const key =
    [...selected].sort().join(",") + (showArchived ? "|archived" : "");

  return (
    <div key={key}>
      <Form
        action="/"
        className="flex flex-wrap items-end gap-3 lg:flex-col lg:flex-nowrap lg:items-stretch"
      >
        <fieldset className={fieldsetClass}>
          <legend className="px-1 font-display text-sm font-semibold">
            Status
          </legend>
          {Object.values(Status).map((status) => (
            <label key={status} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="status"
                value={statusFilterValue(status)}
                defaultChecked={selected.includes(status)}
                className={`check ${STATUS_STYLES[status].check}`}
              />
              {STATUS_LABELS[status]}
            </label>
          ))}
        </fieldset>
        <fieldset className={fieldsetClass}>
          <legend className="px-1 font-display text-sm font-semibold">
            Archive
          </legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="archived"
              value={SHOW_ARCHIVED_VALUE}
              defaultChecked={showArchived}
              className="check text-ink [--check-stripe:transparent]"
            />
            Show archived
          </label>
        </fieldset>
        <div className="ml-auto flex items-center gap-3 py-3 lg:ml-0 lg:justify-between">
          <Link
            href="/"
            className="text-sm text-muted underline underline-offset-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Clear
          </Link>
          <button type="submit" className="button-ink px-3 py-1.5 text-sm">
            Apply
          </button>
        </div>
      </Form>
    </div>
  );
}
