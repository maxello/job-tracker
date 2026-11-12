import Form from "next/form";
import Link from "next/link";
import { Status } from "@/generated/prisma/enums";
import { SHOW_ARCHIVED_VALUE } from "../archived-filter";
import { STATUS_LABELS } from "../status";
import { statusFilterValue } from "../status-filter";

// GET form to `/`: the checked boxes become repeated `status` keys, and "Show
// archived" adds `archived=1` (US-8).
// Checkboxes use defaultChecked, so the wrapper is keyed on the selection to
// re-mount the form after Back, Forward or Clear (`<Form>` with a string
// action doesn't support `key`). See the SPEC.md decision log, 2026-11-11.
// The status boxes are a labelled group of their own, so "Show archived" isn't
// announced as part of Status.
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
    <div key={key} className="mb-4">
      <Form action="/">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div
            role="group"
            aria-labelledby="status-filter-label"
            className="flex flex-wrap items-center gap-x-4 gap-y-2"
          >
            <span id="status-filter-label" className="text-sm font-medium">
              Status
            </span>
            {Object.values(Status).map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="status"
                  value={statusFilterValue(status)}
                  defaultChecked={selected.includes(status)}
                  className="size-4"
                />
                {STATUS_LABELS[status]}
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="archived"
              value={SHOW_ARCHIVED_VALUE}
              defaultChecked={showArchived}
              className="size-4"
            />
            Show archived
          </label>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Clear
            </Link>
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Apply
            </button>
          </div>
        </div>
      </Form>
    </div>
  );
}
