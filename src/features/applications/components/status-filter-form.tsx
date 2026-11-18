import Form from "next/form";
import Link from "next/link";
import { Status } from "@/generated/prisma/enums";
import { SHOW_ARCHIVED_VALUE } from "../archived-filter";
import { STATUS_LABELS } from "../status";
import { countNumberClass, type StatusCounts } from "../status-counts";
import { countClass } from "./board-styles";
import { STATUS_STYLES } from "../status-style";
import { statusFilterValue } from "../status-filter";
import { legendClass } from "./search-field-classes";
import { SearchField } from "./search-field";
import { TimeZoneInput } from "./time-zone-input";

export { legendClass };

// The legends are uppercase through CSS, and Chromium applies text-transform
// to the accessible name ("STATUS"), so each fieldset also gets aria-label in
// normal case; one constant feeds both (SPEC.md decision log, 2026-11-18).
export const LEGENDS = {
  status: "Status",
  updated: "Updated",
  archive: "Archive",
} as const;

// GET form to `/`: the checked boxes become repeated `status` keys, and "Show
// archived" adds `archived=1` (US-8).
// Checkboxes use defaultChecked, so the wrapper is keyed on the selection to
// re-mount the form after Back, Forward or Clear (`<Form>` with a string
// action doesn't support `key`). See the SPEC.md decision log, 2026-11-11.
// Fieldsets named by their legends ("Status", "Updated", "Archive"), so "Show
// archived" isn't announced as a status (SPEC.md decision log, 2026-11-12).
// The form is one surface card like the list card; the fieldsets have no
// border, their legends sit inside the card in the legend style, and Clear
// and Apply follow, below a divider from `lg` (2026-11-18). Below `lg` the fieldsets sit
// side by side; from `lg` they stack in the list's left column, one checkbox
// per line (2026-11-13). The column and its spacing come from ApplicationList.
// US-6 search sits above them: SearchField, a labelled `q` input showing the
// parsed value (2026-11-16), with its "company or role" hint (2026-11-18).

// US-6 date range: an "Updated" fieldset (the word the list rows use for this
// date) between Status and Archive, with From and To date inputs and no
// min/max (2026-11-17). The label wraps the input, so no id is needed (#26).
// The label column has a fixed width, so the two inputs line up. The input
// has a fixed width below `lg` (the full column from it), shared with the
// skeleton's box, which has no content width of its own and would otherwise
// collapse to its padding.
export const dateLabelClass =
  "grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 text-sm lg:w-full";
export const dateInputClass = "field w-36 min-w-0 px-2 py-1 text-sm lg:w-full";

// Shared with the skeleton, so its boxes match by construction (US-6).
// The card matches the list card (8px radius, `line` border).
export const filterCardClass =
  "flex flex-wrap items-end gap-x-7 gap-y-4 rounded-lg border border-line bg-surface p-4 lg:flex-col lg:flex-nowrap lg:items-stretch lg:gap-5 lg:p-4.5";
export const fieldsetClass =
  "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 lg:flex-col lg:items-start";
export const checkLabelClass = "flex items-center gap-2 text-sm";
// US-6: a status row is as wide as the column from `lg`, so its count sits
// at the right edge and the numbers line up; below `lg` the rows wrap side
// by side and the count follows the name (SPEC.md decision log, 2026-11-18).
export const statusLabelClass = `${checkLabelClass} lg:w-full`;
// The count after a status checkbox, tabular digits in the 3ch number span
// (text-align inherits into it). From `lg` they're right-aligned at the row's
// edge, so they line up; below `lg` left-aligned, so a one-digit count
// doesn't leave a wide gap after the name.
export const checkboxCountClass = `${countClass} ml-auto text-left tabular-nums lg:text-right`;
export const actionsClass =
  "ml-auto flex items-center gap-4.5 lg:ml-0 lg:justify-between lg:border-t lg:border-line lg:pt-4";
// The Signal link: text colour, semibold, a thick control-coloured underline
// that turns text-coloured on hover.
export const clearClass =
  "rounded-xs text-sm font-semibold text-text underline decoration-control decoration-2 underline-offset-3";
export const applyClass = "button-ink px-3 py-1.5 text-sm";

export function StatusFilterForm({
  selected,
  showArchived,
  search,
  rawQuery,
  from,
  to,
  rawFrom,
  rawTo,
  rawTimeZone,
  counts,
}: {
  selected: Status[];
  // US-6: shown after each status name, hidden from assistive technology.
  counts?: StatusCounts;
  showArchived: boolean;
  search?: string;
  // The first `q` value as it is in the URL, before parsing.
  rawQuery?: string;
  // The parsed dates (YYYY-MM-DD), shown in the inputs.
  from?: string;
  to?: string;
  // The first `from`, `to` and `tz` values as they are in the URL, before
  // parsing.
  rawFrom?: string;
  rawTo?: string;
  rawTimeZone?: string;
}) {
  // JSON, not a joined string: `q` is user text, so no separator is safe
  // (`?archived=1` and `?q=archived` would collide on "|archived"). The key
  // tells apart every list URL the form must re-mount between, so Back and
  // Forward drop unapplied input (SPEC.md decision log, 2026-11-17). Raw
  // values, not parsed ones: `/` and `/?q=`, or `?q=acme` and
  // `?q=%20acme%20`, parse the same. `tz` is in it although it isn't a
  // visible field: Apply replaces another zone (a bookmark, or `tz=` from a
  // submit before hydration) with the browser's, so two URLs can differ only
  // in `tz`.
  const key = JSON.stringify([
    [...selected].sort(),
    showArchived,
    rawQuery ?? null,
    rawFrom ?? null,
    rawTo ?? null,
    rawTimeZone ?? null,
  ]);

  return (
    <div key={key}>
      <Form action="/" className={filterCardClass}>
        <SearchField defaultValue={search} />
        <fieldset className={fieldsetClass} aria-label={LEGENDS.status}>
          <legend className={legendClass}>{LEGENDS.status}</legend>
          {Object.values(Status).map((status) => (
            <label key={status} className={statusLabelClass}>
              <input
                type="checkbox"
                name="status"
                value={statusFilterValue(status)}
                defaultChecked={selected.includes(status)}
                className={`check ${STATUS_STYLES[status].check}`}
              />
              {STATUS_LABELS[status]}
              {/* aria-hidden: the checkbox's name stays the status name, and
                  the Pipeline legend reads the counts (SPEC.md decision
                  log, 2026-11-18). */}
              {counts && (
                <span aria-hidden="true" className={checkboxCountClass}>
                  <span className={countNumberClass}>{counts[status]}</span>
                </span>
              )}
            </label>
          ))}
        </fieldset>
        <fieldset className={fieldsetClass} aria-label={LEGENDS.updated}>
          <legend className={legendClass}>{LEGENDS.updated}</legend>
          {(
            [
              ["from", "From", from],
              ["to", "To", to],
            ] as const
          ).map(([name, label, value]) => (
            <label key={name} className={dateLabelClass}>
              {label}
              <input
                type="date"
                name={name}
                defaultValue={value}
                className={dateInputClass}
              />
            </label>
          ))}
        </fieldset>
        <TimeZoneInput />
        <fieldset className={fieldsetClass} aria-label={LEGENDS.archive}>
          <legend className={legendClass}>{LEGENDS.archive}</legend>
          <label className={checkLabelClass}>
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
        <div className={actionsClass}>
          <Link
            href="/"
            className={`${clearClass} hover:decoration-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus`}
          >
            Clear
          </Link>
          <button type="submit" className={applyClass}>
            Apply
          </button>
        </div>
      </Form>
    </div>
  );
}
