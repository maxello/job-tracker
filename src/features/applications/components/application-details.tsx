import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUserId } from "@/lib/current-user";
import { getApplication } from "../queries";
import { applicationIdSchema } from "../schemas";
import { STATUS_LABELS } from "../status";
import { STATUS_STYLES } from "../status-style";
import { ArchiveForm } from "./archive-form";
import { ArrowIcon } from "./arrow-icon";
import { ArchivedBadge } from "./archived-badge";
import { DeleteApplication } from "./delete-application";
import { LocalDate } from "./local-date";
import { StatusForm } from "./status-form";

const DATE_TIME: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

// Fixed locale so the server render is deterministic; the UI is in English.
// null when there's nothing to show; Field renders the empty placeholder.
function formatSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
) {
  if (currency === null || (min === null && max === null)) return null;
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

// The one empty placeholder, so every empty field looks the same: never
// inside a value's own styling (mono, pre-wrap, link).
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-sm break-words">
        {children ?? <span className="text-muted">—</span>}
      </dd>
    </div>
  );
}

// A value in Martian Mono (salary, dates), sized like the history dates.
function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs">{children}</span>;
}

const card = "rounded-lg border border-line bg-surface";
const pulse = "animate-pulse rounded bg-line";

export async function ApplicationDetails({ id }: { id: string }) {
  const userId = await getCurrentUserId();
  const parsedId = applicationIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const application = await getApplication(userId, parsedId.data);
  // Missing or another user's application: 404, never 403.
  if (!application) notFound();
  const archived = application.archivedAt !== null;
  // From the record id, not useId(): on the server its counter restarts with
  // every RSC request, and a hidden detail page can stay in the document (#26).
  const historyHeadingId = `history-heading-${application.id}`;
  const style = STATUS_STYLES[application.status];
  const salary = formatSalary(
    application.salaryMin,
    application.salaryMax,
    application.salaryCurrency,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* The status edge, as on a list row; Offer is tinted. */}
      <header
        className={`min-w-0 rounded-lg border border-l-6 border-line px-4 py-4 sm:px-6 ${style.panel}`}
      >
        <h1
          className={`page-heading break-words max-sm:text-heading-sm ${archived ? "text-muted" : ""}`}
        >
          {application.company}
        </h1>
        <p className="mt-1 break-words text-muted">{application.role}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`badge ${style.badge}`}>
            {STATUS_LABELS[application.status]}
          </span>
          {archived && <ArchivedBadge />}
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <Link
            href={`/applications/${application.id}/edit`}
            className="button-quiet px-4 py-2 text-sm"
          >
            Edit
          </Link>
          {/* Not keyed: it stays mounted across refresh() to move focus. */}
          <ArchiveForm id={application.id} archived={archived} />
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

      <dl className={`grid gap-5 p-4 sm:grid-cols-2 sm:p-6 ${card}`}>
        <div className="sm:col-span-2">
          <Field label="Job URL">
            {application.url ? (
              <a
                href={application.url}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all text-text underline underline-offset-2 hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {application.url}
              </a>
            ) : null}
          </Field>
        </div>
        <Field label="Location">{application.location}</Field>
        <Field label="Level">{application.level}</Field>
        <Field label="Stack">
          {application.stack.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {application.stack.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-bg px-2 py-0.5 text-xs break-all"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </Field>
        <Field label="Salary (annual gross)">
          {salary !== null ? <Mono>{salary}</Mono> : null}
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            {application.notes !== null ? (
              <span className="whitespace-pre-wrap">{application.notes}</span>
            ) : null}
          </Field>
        </div>
        <Field label="Created">
          <Mono>
            <LocalDate
              date={application.createdAt.toISOString()}
              options={DATE_TIME}
            />
          </Mono>
        </Field>
        <Field label="Last updated">
          <Mono>
            <LocalDate
              date={application.updatedAt.toISOString()}
              options={DATE_TIME}
            />
          </Mono>
        </Field>
      </dl>

      <section aria-labelledby={historyHeadingId}>
        <h2
          id={historyHeadingId}
          className="mb-3 font-display text-lg font-semibold"
        >
          Status history
        </h2>
        <ol className={`divide-y divide-line ${card}`}>
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
                    <ArrowIcon
                      direction="right"
                      className="inline align-text-bottom"
                    />
                    <span className="sr-only">to</span>{" "}
                    {STATUS_LABELS[change.to]}
                  </>
                )}
              </span>
              <span className="font-mono text-xs">
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
      className="flex flex-col gap-6"
    >
      {/* Same card boxes as the real page, so their borders don't pop in. */}
      <div
        className={`flex flex-col gap-3 border-l-6 border-l-line px-4 py-4 sm:px-6 ${card}`}
      >
        <div className={`h-7 w-1/2 ${pulse}`} />
        <div className={`h-4 w-1/3 ${pulse}`} />
        <div className={`h-5 w-16 ${pulse}`} />
      </div>
      <div className={`h-24 ${card}`} />
    </div>
  );
}
