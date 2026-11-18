import Link from "next/link";
import { Status } from "@/generated/prisma/enums";
import { getCurrentUserId } from "@/lib/current-user";
import { parseShowArchived, SHOW_ARCHIVED_VALUE } from "../archived-filter";
import { dateRange, parseDateParam, parseTimeZone } from "../date-filter";
import {
  countApplicationsByStatus,
  hasArchivedApplications,
  listApplications,
} from "../queries";
import { STATUS_LABELS } from "../status";
import { parseSearchQuery } from "../search-filter";
import { parseStatusFilter, statusFilterValue } from "../status-filter";
import { STATUS_STYLES } from "../status-style";
import { ArchivedBadge } from "./archived-badge";
import {
  AllArchived,
  emptyBox,
  emptyLink,
  NoApplications,
} from "./empty-states";
import { LocalDate } from "./local-date";
import { CountPulse, PipelineBar, PipelineBarSkeleton } from "./pipeline-bar";
import {
  actionsClass,
  applyClass,
  checkboxCountClass,
  checkLabelClass,
  clearClass,
  dateInputClass,
  dateLabelClass,
  fieldsetClass,
  legendClass,
  searchInputClass,
  searchLabelClass,
  StatusFilterForm,
  statusLabelClass,
} from "./status-filter-form";
import { ViewSwitcher } from "./view-switcher";

type SearchParams = Record<string, string | string[] | undefined>;

// From `lg`, the filter form is a sticky column left of the list; below it,
// the form sits above the list (SPEC.md decision log, 2026-11-13; the 14rem
// column, 2026-11-14).
// `items-start` keeps the column at its own height so it can stick, and
// `minmax(0,1fr)` lets long names truncate instead of widening the grid. The
// column has a fixed width, so the skeleton matches it without measuring text.
// The view switcher (US-5) comes first: above the filter form below `lg`,
// and from `lg` in row 1 of the list column, so it doesn't push the filter
// column down. The filter column spans both rows; `auto_1fr` rows give the
// extra height to row 2, so the switcher's row stays its own height.
const listLayout =
  "lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6 lg:gap-y-4";
const switcherCell = "mb-4 lg:col-start-2 lg:row-start-1 lg:mb-0";
const filterColumn =
  "mb-4 lg:sticky lg:top-4 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mb-0";
const resultsCell = "lg:col-start-2 lg:row-start-2";

// The list is a surface card: Rejected's grey edge reaches 3:1 on the
// surface, not on the page background. Each row carries a 6px status edge;
// its focus outline is inset, so the card's overflow-hidden can't clip it.
const listBox =
  "divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface";
const rowLayout =
  "flex flex-col gap-2 border-l-6 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4";
const rowClass = `${rowLayout} hover:bg-row-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus`;
const rowMeta = "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm";

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
  const from = parseDateParam(params.from);
  const to = parseDateParam(params.to);
  const updated = dateRange(from, to, parseTimeZone(params.tz));
  const firstRaw = (value: string | string[] | undefined) =>
    [value ?? []].flat()[0];
  // US-6: the counts and the list start together in this one <Suspense>, so
  // there is no waterfall and no second boundary (SPEC.md decision log,
  // 2026-11-18). The counts respect only "Show archived".
  const userId = await getCurrentUserId();
  const [counts, applications] = await Promise.all([
    countApplicationsByStatus(userId, { includeArchived: showArchived }),
    listApplications(userId, {
      statuses,
      includeArchived: showArchived,
      search,
      updated,
    }),
  ]);
  return (
    <div className={listLayout}>
      <div className={switcherCell}>
        <ViewSwitcher current="list" />
      </div>
      <div className={filterColumn}>
        <StatusFilterForm
          selected={statuses}
          showArchived={showArchived}
          search={search}
          rawQuery={firstRaw(params.q)}
          from={from}
          to={to}
          rawFrom={firstRaw(params.from)}
          rawTo={firstRaw(params.to)}
          rawTimeZone={firstRaw(params.tz)}
          counts={counts}
        />
      </div>
      <div className={resultsCell}>
        <PipelineBar counts={counts} />
        <Results
          userId={userId}
          applications={applications}
          showArchived={showArchived}
          filtered={
            statuses.length > 0 ||
            search !== undefined ||
            from !== undefined ||
            to !== undefined
          }
        />
      </div>
    </div>
  );
}

async function Results({
  userId,
  applications,
  showArchived,
  filtered,
}: {
  userId: string;
  applications: Awaited<ReturnType<typeof listApplications>>;
  showArchived: boolean;
  // Empty state 1 (US-6): a valid status, search or date (`from` or `to`)
  // filter is active; "Show archived" and `tz` don't count as filters.
  filtered: boolean;
}) {
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
    return <AllArchived href={`/?archived=${SHOW_ARCHIVED_VALUE}`} />;
  }

  if (applications.length === 0) return <NoApplications />;

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

// The list rows are data placeholders: their one static word ("Updated") is
// transparent on the pulse, so the font sets its width, and
// forced-color-adjust-none keeps it transparent in forced colors. Only
// dynamic text has fixed sizes. Each element repeats the real one's classes.
const pulse = "animate-pulse rounded bg-line";
const hiddenText = "text-transparent select-none";
const textPulse = `${pulse} ${hiddenText}`;

export function ApplicationListSkeleton() {
  return (
    <div className={listLayout}>
      {/* Static, so the real switcher: it doesn't move when the list loads. */}
      <div className={switcherCell}>
        <ViewSwitcher current="list" />
      </div>
      <div className={filterColumn}>
        <StatusFilterSkeleton />
      </div>
      <div className={resultsCell}>
        <PipelineBarSkeleton />
        <ul
          aria-busy="true"
          aria-label="Loading applications"
          data-skeleton="list"
          className={`${listBox} forced-color-adjust-none`}
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
    </div>
  );
}

// Static labels are visible real text with the real classes; only what
// comes from the URL or the data pulses: checkbox state, the search and
// date values, and the counts (SPEC.md decision log, 2026-11-18). The
// data-skeleton hooks let e2e/filter-layout.spec.ts compare positions.
export function StatusFilterSkeleton() {
  const box = `size-4.5 shrink-0 ${pulse}`;
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-end gap-3 lg:flex-col lg:flex-nowrap lg:items-stretch"
    >
      {/* The field boxes keep the real border and padding; the value inside
          pulses, one text-sm line (h-5) tall like the input's text. */}
      <div className={searchLabelClass}>
        <span>Search company or role</span>
        <span data-skeleton="search" className={`block ${searchInputClass}`}>
          <span className={`block h-5 ${pulse}`} />
        </span>
      </div>
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Status</legend>
        {Object.values(Status).map((status) => (
          <div
            key={status}
            data-skeleton={`status-${statusFilterValue(status)}`}
            className={statusLabelClass}
          >
            <span className={box} />
            <span>{STATUS_LABELS[status]}</span>
            <span className={checkboxCountClass}>
              <CountPulse />
            </span>
          </div>
        ))}
      </fieldset>
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Updated</legend>
        {(
          [
            ["from", "From"],
            ["to", "To"],
          ] as const
        ).map(([name, label]) => (
          <div key={name} className={dateLabelClass}>
            <span>{label}</span>
            <span data-skeleton={name} className={`block ${dateInputClass}`}>
              <span className={`block h-5 ${pulse}`} />
            </span>
          </div>
        ))}
      </fieldset>
      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>Archive</legend>
        <div data-skeleton="show-archived" className={checkLabelClass}>
          <span className={box} />
          <span>Show archived</span>
        </div>
      </fieldset>
      {/* Not interactive: no pointer, no hover. */}
      <div className={actionsClass}>
        <span
          data-skeleton="clear"
          className={`${clearClass} pointer-events-none`}
        >
          Clear
        </span>
        <span
          data-skeleton="apply"
          className={`${applyClass} pointer-events-none`}
        >
          Apply
        </span>
      </div>
    </div>
  );
}
