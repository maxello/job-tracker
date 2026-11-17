import Link from "next/link";
import { Status } from "@/generated/prisma/enums";
import { getCurrentUserId } from "@/lib/current-user";
import { parseShowArchived, SHOW_ARCHIVED_VALUE } from "../archived-filter";
import { hasArchivedApplications, listApplications } from "../queries";
import { STATUS_LABELS } from "../status";
import { parseSearchQuery } from "../search-filter";
import { parseStatusFilter } from "../status-filter";
import { STATUS_STYLES } from "../status-style";
import { ArchivedBadge } from "./archived-badge";
import { LocalDate } from "./local-date";
import {
  searchInputClass,
  searchLabelClass,
  StatusFilterForm,
} from "./status-filter-form";

type SearchParams = Record<string, string | string[] | undefined>;

// From `lg`, the filter form is a sticky column left of the list; below it,
// the form sits above the list (SPEC.md decision log, 2026-11-13; the 14rem
// column, 2026-11-14).
// `items-start` keeps the column at its own height so it can stick, and
// `minmax(0,1fr)` lets long names truncate instead of widening the grid. The
// column has a fixed width, so the skeleton matches it without measuring text.
const listLayout =
  "lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start lg:gap-6";
const filterColumn = "mb-4 lg:sticky lg:top-4 lg:mb-0";

// The list is a surface card: Rejected's grey edge reaches 3:1 on the
// surface, not on the page background. Each row carries a 6px status edge;
// its focus outline is inset, so the card's overflow-hidden can't clip it.
const listBox =
  "divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface";
const rowLayout =
  "flex flex-col gap-2 border-l-6 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4";
const rowClass = `${rowLayout} hover:bg-row-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`;
const rowMeta = "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm";
const emptyBox =
  "rounded-lg border border-dashed border-control px-4 py-12 text-center";
const emptyLink =
  "mt-4 inline-block text-sm font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Reads searchParams inside the page's <Suspense>, so the header stays in the
// static shell (SPEC.md decision log, 2026-11-11).
export async function ApplicationList({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const statuses = parseStatusFilter(params.status);
  const showArchived = parseShowArchived(params.archived);
  const search = parseSearchQuery(params.q);
  return (
    <div className={listLayout}>
      <div className={filterColumn}>
        <StatusFilterForm
          selected={statuses}
          showArchived={showArchived}
          search={search}
          rawQuery={[params.q ?? []].flat()[0]}
        />
      </div>
      <Results
        statuses={statuses}
        showArchived={showArchived}
        search={search}
      />
    </div>
  );
}

async function Results({
  statuses,
  showArchived,
  search,
}: {
  statuses: Status[];
  showArchived: boolean;
  search: string | undefined;
}) {
  const userId = await getCurrentUserId();
  const applications = await listApplications(userId, {
    statuses,
    includeArchived: showArchived,
    search,
  });

  // Empty state 1 (US-6): a valid status or search filter is active; "Show
  // archived" doesn't count as a filter.
  const filtered = statuses.length > 0 || search !== undefined;
  if (applications.length === 0 && filtered) {
    return (
      <div className={emptyBox}>
        <p className="text-muted">No applications match your filters.</p>
        <Link href="/" className={emptyLink}>
          Clear filters
        </Link>
      </div>
    );
  }

  // Only the default view can hide everything the user has; the extra query
  // runs just in that case (SPEC.md decision log, 2026-11-12).
  if (
    applications.length === 0 &&
    !showArchived &&
    (await hasArchivedApplications(userId))
  ) {
    return (
      <div className={emptyBox}>
        <p className="text-muted">All your applications are archived.</p>
        <Link href={`/?archived=${SHOW_ARCHIVED_VALUE}`} className={emptyLink}>
          Show archived
        </Link>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className={emptyBox}>
        <p className="text-muted">No applications yet.</p>
        <Link
          href="/applications/new"
          className="button-ink mt-4 px-4 py-2 text-sm"
        >
          Add your first application
        </Link>
      </div>
    );
  }

  return (
    <ul className={listBox}>
      {applications.map((application) => {
        const style = STATUS_STYLES[application.status];
        const archived = application.archivedAt !== null;
        return (
          <li key={application.id}>
            <Link
              href={`/applications/${application.id}`}
              className={`${rowClass} ${style.edge}`}
            >
              <div className="min-w-0">
                <p
                  className={`truncate font-semibold ${archived ? "text-muted" : ""}`}
                >
                  {application.company}
                </p>
                <p className="truncate text-sm text-muted">
                  {application.role}
                </p>
              </div>
              <div className={rowMeta}>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.badge}`}
                >
                  {STATUS_LABELS[application.status]}
                </span>
                {archived && <ArchivedBadge />}
                <span className="text-xs whitespace-nowrap text-muted">
                  Updated{" "}
                  <span className="ml-1 font-mono">
                    <LocalDate date={application.updatedAt.toISOString()} />
                  </span>
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// Static labels are the real words, transparent on the pulse, so the font sets
// their width and the skeleton wraps like the form at every width; only
// dynamic text has fixed sizes. Each element repeats the real one's classes.
// forced-color-adjust-none keeps the words transparent in forced colors.
const pulse = "animate-pulse rounded bg-line";
const hiddenText = "text-transparent select-none";
const textPulse = `${pulse} ${hiddenText}`;

export function ApplicationListSkeleton() {
  return (
    <div className={`${listLayout} forced-color-adjust-none`}>
      <div className={filterColumn}>
        <StatusFilterSkeleton />
      </div>
      <ul
        aria-busy="true"
        aria-label="Loading applications"
        className={listBox}
      >
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <div aria-hidden="true" className={`${rowLayout} border-l-line`}>
              {/* Company (a 24px line) and role (20px), as in a real row. */}
              <div className="min-w-0 flex-1">
                <div className="flex h-6 items-center">
                  <div className={`h-4 w-1/3 ${pulse}`} />
                </div>
                <div className="flex h-5 items-center">
                  <div className={`h-3 w-1/2 ${pulse}`} />
                </div>
              </div>
              <div className={rowMeta}>
                <span className="h-5 w-16 animate-pulse rounded-full bg-line" />
                <span className="text-xs whitespace-nowrap">
                  <span className={textPulse}>Updated</span>{" "}
                  <span className={`ml-1 inline-block h-3 w-20 ${pulse}`} />
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusFilterSkeleton() {
  const fieldset =
    "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 lg:flex-col lg:items-start";
  const legend = "px-1 font-display text-sm font-semibold";
  const label = "flex items-center gap-2 text-sm";
  const box = `size-4.5 shrink-0 ${pulse}`;
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-end gap-3 lg:flex-col lg:flex-nowrap lg:items-stretch"
    >
      {/* The search box keeps the real field's border and padding, but its
          value comes from the URL like the checkbox states, so the inside
          pulses. The bar is one text-sm line (h-5), the input's line height,
          so the box is as tall as the loaded one. */}
      <div className={searchLabelClass}>
        <span className={textPulse}>Search company or role</span>
        <span className={`block ${searchInputClass}`}>
          <span className={`block h-5 ${pulse}`} />
        </span>
      </div>
      <fieldset className={fieldset}>
        <legend className={legend}>
          <span className={textPulse}>Status</span>
        </legend>
        {Object.values(Status).map((status) => (
          <div key={status} className={label}>
            <span className={box} />
            <span className={textPulse}>{STATUS_LABELS[status]}</span>
          </div>
        ))}
      </fieldset>
      <fieldset className={fieldset}>
        <legend className={legend}>
          <span className={textPulse}>Archive</span>
        </legend>
        <div className={label}>
          <span className={box} />
          <span className={textPulse}>Show archived</span>
        </div>
      </fieldset>
      <div className="ml-auto flex items-center gap-3 py-3 lg:ml-0 lg:justify-between">
        <span className={`text-sm ${textPulse}`}>Clear</span>
        {/* Box classes mirror button-ink (globals.css); change them together. */}
        <span
          className={`inline-flex items-center justify-center rounded-md border border-transparent px-3 py-1.5 text-sm font-semibold animate-pulse bg-line ${hiddenText}`}
        >
          Apply
        </span>
      </div>
    </div>
  );
}
