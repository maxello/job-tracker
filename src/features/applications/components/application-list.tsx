import Link from "next/link";
import type { Status } from "@/generated/prisma/enums";
import { getCurrentUserId } from "@/lib/current-user";
import { parseShowArchived, SHOW_ARCHIVED_VALUE } from "../archived-filter";
import { hasArchivedApplications, listApplications } from "../queries";
import { STATUS_LABELS } from "../status";
import { parseStatusFilter } from "../status-filter";
import { ArchivedBadge } from "./archived-badge";
import { LocalDate } from "./local-date";
import { StatusFilterForm } from "./status-filter-form";

type SearchParams = Record<string, string | string[] | undefined>;

// From `lg`, the filter form is a sticky column left of the list; below it,
// the form sits above the list (SPEC.md decision log, 2026-11-13).
// `items-start` keeps the column at its own height so it can stick, and
// `minmax(0,1fr)` lets long names truncate instead of widening the grid. The
// column has a fixed width, so the skeleton matches it without measuring text.
const listLayout =
  "lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-6";
const filterColumn = "mb-4 lg:sticky lg:top-4 lg:mb-0";

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
  return (
    <div className={listLayout}>
      <div className={filterColumn}>
        <StatusFilterForm selected={statuses} showArchived={showArchived} />
      </div>
      <Results statuses={statuses} showArchived={showArchived} />
    </div>
  );
}

async function Results({
  statuses,
  showArchived,
}: {
  statuses: Status[];
  showArchived: boolean;
}) {
  const userId = await getCurrentUserId();
  const applications = await listApplications(userId, {
    statuses,
    includeArchived: showArchived,
  });

  if (applications.length === 0 && statuses.length > 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-12 text-center dark:border-zinc-700">
        <p className="text-zinc-600 dark:text-zinc-400">
          No applications match your filters.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm font-medium hover:underline"
        >
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
      <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-12 text-center dark:border-zinc-700">
        <p className="text-zinc-600 dark:text-zinc-400">
          All your applications are archived.
        </p>
        <Link
          href={`/?archived=${SHOW_ARCHIVED_VALUE}`}
          className="mt-4 inline-block text-sm font-medium hover:underline"
        >
          Show archived
        </Link>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-12 text-center dark:border-zinc-700">
        <p className="text-zinc-600 dark:text-zinc-400">No applications yet.</p>
        <Link
          href="/applications/new"
          className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Add your first application
        </Link>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
      {applications.map((application) => (
        <li key={application.id}>
          <Link
            href={`/applications/${application.id}`}
            className="flex flex-col gap-2 px-4 py-3 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:hover:bg-zinc-900"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{application.company}</p>
              <p className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                {application.role}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-sm">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {STATUS_LABELS[application.status]}
              </span>
              {application.archivedAt !== null && <ArchivedBadge />}
              <span className="text-zinc-500 dark:text-zinc-400">
                Updated <LocalDate date={application.updatedAt.toISOString()} />
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ApplicationListSkeleton() {
  return (
    <div className={listLayout}>
      <div className={filterColumn}>
        <StatusFilterSkeleton />
      </div>
      <ul
        aria-busy="true"
        aria-label="Loading applications"
        className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800"
      >
        {[0, 1, 2].map((i) => (
          <li key={i} className="space-y-2 px-4 py-3">
            <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          </li>
        ))}
      </ul>
    </div>
  );
}

// Mirrors StatusFilterForm's box model (same fieldsets/legends/gaps, at both
// breakpoints) so the filter doesn't pop in next to the list. Widths are the
// rendered text widths of each label at text-sm in the body font (Arial,
// globals.css), in px: below `lg` the real filter fits one row with only ~2px
// to spare, so wider placeholders would wrap Clear and Apply.
const FILTER_LABEL_WIDTHS = [
  "w-[48px]", // Wishlist
  "w-[47px]", // Applied
  "w-[56px]", // Interview
  "w-[31px]", // Offer
  "w-[55px]", // Rejected
];

function StatusFilterSkeleton() {
  const pulse = "animate-pulse rounded bg-zinc-200 dark:bg-zinc-800";
  const fieldset =
    "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-zinc-200 px-4 py-3 lg:flex-col lg:items-start dark:border-zinc-800";
  return (
    <div
      aria-hidden="true"
      className="flex flex-wrap items-end gap-3 lg:flex-col lg:flex-nowrap lg:items-stretch"
    >
      <fieldset className={fieldset}>
        <legend className="px-1 py-0.5">
          <div className={`h-4 w-[40px] ${pulse}`} />
        </legend>
        {FILTER_LABEL_WIDTHS.map((width, i) => (
          <div key={i} className="flex h-5 items-center gap-2">
            <div className={`size-4 ${pulse}`} />
            <div className={`h-4 ${width} ${pulse}`} />
          </div>
        ))}
      </fieldset>
      <fieldset className={fieldset}>
        <legend className="px-1 py-0.5">
          <div className={`h-4 w-[47px] ${pulse}`} />
        </legend>
        <div className="flex h-5 items-center gap-2">
          <div className={`size-4 ${pulse}`} />
          <div className={`h-4 w-[92px] ${pulse}`} />
        </div>
      </fieldset>
      <div className="ml-auto flex items-center gap-3 py-3">
        {/* Clear is a 20px text line; Apply a 32px button. */}
        <div className="flex h-5 w-[33px] items-center">
          <div className={`h-4 w-full ${pulse}`} />
        </div>
        <div className="h-8 w-[59px] animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}
