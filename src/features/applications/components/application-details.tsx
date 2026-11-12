import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUserId } from "@/lib/current-user";
import { getApplication } from "../queries";
import { applicationIdSchema } from "../schemas";
import { STATUS_LABELS } from "../status";
import { ArchiveForm } from "./archive-form";
import { ArchivedBadge } from "./archived-badge";
import { DeleteApplication } from "./delete-application";
import { LocalDate } from "./local-date";
import { StatusForm } from "./status-form";

const DATE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

const EMPTY = "—";

// Fixed locale so the server render is deterministic; the UI is in English.
function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
) {
  if (currency === null || (min === null && max === null)) return EMPTY;
  const format = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  // formatRange marks equal ends as approximate ("~$100,000"), so show one value.
  if (min !== null && min === max) return format.format(min);
  if (min !== null && max !== null) return format.formatRange(min, max);
  if (min !== null) return `from ${format.format(min)}`;
  return `up to ${format.format(max!)}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

export async function ApplicationDetails({ id }: { id: string }) {
  const userId = await getCurrentUserId();
  const parsedId = applicationIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const application = await getApplication(userId, parsedId.data);
  // Missing or another user's application: 404, never 403.
  if (!application) notFound();
  const archived = application.archivedAt !== null;

  return (
    <div className="flex flex-col gap-8">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {application.company}
        </h1>
        <p className="mt-1 break-words text-zinc-600 dark:text-zinc-400">
          {application.role}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {STATUS_LABELS[application.status]}
          </span>
          {archived && <ArchivedBadge />}
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <Link
            href={`/applications/${application.id}/edit`}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Edit
          </Link>
          {/* Keyed on the state, so it re-mounts with the other action after refresh(). */}
          <ArchiveForm
            key={String(archived)}
            id={application.id}
            archived={archived}
          />
          <DeleteApplication
            id={application.id}
            name={`${application.role} at ${application.company}`}
          />
        </div>
      </header>

      <StatusForm
        key={application.status}
        id={application.id}
        status={application.status}
      />

      <dl className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Job URL">
            {application.url ? (
              <a
                href={application.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-zinc-900 underline hover:text-zinc-600 dark:text-zinc-100 dark:hover:text-zinc-300"
              >
                {application.url}
              </a>
            ) : (
              EMPTY
            )}
          </Field>
        </div>
        <Field label="Location">{application.location ?? EMPTY}</Field>
        <Field label="Level">{application.level ?? EMPTY}</Field>
        <Field label="Stack">
          {application.stack.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {application.stack.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs break-all text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : (
            EMPTY
          )}
        </Field>
        <Field label="Salary (annual gross)">
          {formatSalary(
            application.salaryMin,
            application.salaryMax,
            application.salaryCurrency,
          )}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <span className="whitespace-pre-wrap">
              {application.notes ?? EMPTY}
            </span>
          </Field>
        </div>
        <Field label="Created">
          <LocalDate
            date={application.createdAt.toISOString()}
            options={DATE_TIME}
          />
        </Field>
        <Field label="Last updated">
          <LocalDate
            date={application.updatedAt.toISOString()}
            options={DATE_TIME}
          />
        </Field>
      </dl>

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          Status history
        </h2>
        <ol className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {application.statusChanges.map((change) => (
            <li
              key={change.id}
              className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="font-medium">
                {change.from === null ? (
                  <>Created as {STATUS_LABELS[change.to]}</>
                ) : (
                  <>
                    {STATUS_LABELS[change.from]}{" "}
                    <span aria-hidden="true">→</span>
                    <span className="sr-only">to</span>{" "}
                    {STATUS_LABELS[change.to]}
                  </>
                )}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                <LocalDate
                  date={change.changedAt.toISOString()}
                  options={DATE_TIME}
                />
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function ApplicationDetailsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading application"
      className="flex flex-col gap-4"
    >
      <div className="h-7 w-1/2 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-24 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
