import Link from "next/link";
import type { Status } from "@/generated/prisma/enums";
import { getCurrentUserId } from "@/lib/current-user";
import { listApplications } from "../queries";
import { STATUS_LABELS } from "../status";
import { parseStatusFilter } from "../status-filter";
import { LocalDate } from "./local-date";
import { StatusFilterForm } from "./status-filter-form";

type SearchParams = Record<string, string | string[] | undefined>;

// Reads searchParams inside the page's <Suspense>, so the header stays in the
// static shell (SPEC.md decision log, 2026-11-11).
export async function ApplicationList({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const statuses = parseStatusFilter((await searchParams).status);
  return (
    <>
      <StatusFilterForm selected={statuses} />
      <Results statuses={statuses} />
    </>
  );
}

async function Results({ statuses }: { statuses: Status[] }) {
  const userId = await getCurrentUserId();
  const applications = await listApplications(userId, { statuses });

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
    <>
      <StatusFilterSkeleton />
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
    </>
  );
}

// Mirrors StatusFilterForm's box model (same fieldset/legend/gaps) so the
// filter doesn't pop in above the list. Widths approximate each label at
// text-sm, so the rows wrap the same way at narrow widths.
const FILTER_LABEL_WIDTHS = ["w-14", "w-12", "w-16", "w-9", "w-14"];

function StatusFilterSkeleton() {
  const pulse = "animate-pulse rounded bg-zinc-200 dark:bg-zinc-800";
  return (
    <div aria-hidden="true" className="mb-4">
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <legend className="px-1 py-0.5">
          <div className={`h-4 w-12 ${pulse}`} />
        </legend>
        {FILTER_LABEL_WIDTHS.map((width, i) => (
          <div key={i} className="flex h-5 items-center gap-2">
            <div className={`size-4 ${pulse}`} />
            <div className={`h-4 ${width} ${pulse}`} />
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <div className={`h-4 w-8 ${pulse}`} />
          <div className="h-8 w-16 animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800" />
        </div>
      </fieldset>
    </div>
  );
}
