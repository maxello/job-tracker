import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUserId } from "@/lib/current-user";
import { listReturnQuery, type ListReturn } from "../list-return";
import { getApplication } from "../queries";
import { applicationIdSchema } from "../schemas";
import { STATUS_LABELS } from "../status";
import { STATUS_STYLES } from "../status-style";
import { ArchiveForm } from "./archive-form";
import { ArrowIcon } from "./arrow-icon";
import { ArchivedBadge } from "./archived-badge";
import { inkButtonClass, quietButtonClass } from "./button-classes";
import { DeleteApplication } from "./delete-application";
import { LocalDate } from "./local-date";
import { StatusForm } from "./status-form";
import {
  statusFormClass,
  statusLabelClass,
  statusRowClass,
  statusSelectClass,
} from "./status-form-classes";

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
    <div className={fieldClass}>
      <dt className={termClass}>{label}</dt>
      <dd className={valueClass}>
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

// Shared by the page and its skeleton, so the boxes match by construction
// (SPEC.md decision log, 2026-11-19).
const detailLayout = "flex flex-col gap-6";
// The status edge, as on a list row; the page adds the status `panel`.
const headerClass =
  "min-w-0 rounded-lg border border-l-6 border-line px-4 py-4 sm:px-6";
const badgeRowClass = "mt-3 flex flex-wrap gap-2";
const actionsRowClass = "mt-4 flex flex-wrap items-start gap-3";
const dlClass = `grid gap-5 p-4 sm:grid-cols-2 sm:p-6 ${card}`;
const wideClass = "sm:col-span-2";
const fieldClass = "min-w-0";
const termClass = "text-sm text-muted";
const valueClass = "mt-1 text-sm break-words";
const historyHeadingClass = "mb-3 font-display text-lg font-semibold";
const historyListClass = `divide-y divide-line ${card}`;
const historyRowClass =
  "flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4";

// `returnTo`: the list's filters or the board, kept by the Edit link (US-5,
// US-6). Without it, the unfiltered list.
export async function ApplicationDetails({
  id,
  returnTo,
}: {
  id: string;
  returnTo?: ListReturn;
}) {
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
    <div className={detailLayout}>
      {/* The status edge, as on a list row; Offer is tinted. */}
      <header className={`${headerClass} ${style.panel}`}>
        <h1
          className={`page-heading break-words max-sm:text-heading-sm ${archived ? "text-muted" : ""}`}
        >
          {application.company}
        </h1>
        <p className="mt-1 break-words text-muted">{application.role}</p>
        <div className={badgeRowClass}>
          <span className={`badge ${style.badge}`}>
            {STATUS_LABELS[application.status]}
          </span>
          {archived && <ArchivedBadge />}
        </div>
        <div className={actionsRowClass}>
          <Link
            href={`/applications/${application.id}/edit${returnTo ? listReturnQuery(returnTo) : ""}`}
            transitionTypes={["nav-forward"]}
            className={quietButtonClass}
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

      <dl className={dlClass}>
        <div className={wideClass}>
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
        <div className={wideClass}>
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
        <h2 id={historyHeadingId} className={historyHeadingClass}>
          Status history
        </h2>
        <ol className={historyListClass}>
          {application.statusChanges.map((change) => (
            <li key={change.id} className={historyRowClass}>
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

// Words inside a data placeholder stay hidden on the pulse; without
// forced-color-adjust-none, forced colors would drop the pulse and paint them.
const textPulse = `${pulse} text-transparent select-none forced-color-adjust-none`;

// The eight fields in page order: [label, data-skeleton slug, full width].
const SKELETON_FIELDS = [
  ["Job URL", "url", true],
  ["Location", "location", false],
  ["Level", "level", false],
  ["Stack", "stack", false],
  ["Salary (annual gross)", "salary", false],
  ["Notes", "notes", true],
  ["Created", "created", false],
  ["Last updated", "updated", false],
] as const;

// The page's boxes with the page's classes (SPEC.md decision log,
// 2026-11-19): static labels are visible real text, only data pulses, each
// value is one text-sm line. Fake controls are spans: no label, no id,
// nothing focusable. The visual root is aria-hidden; screen readers get the
// sr-only line before it. The data-skeleton hooks let
// e2e/skeleton-layout.spec.ts compare positions.
export function ApplicationDetailsSkeleton() {
  return (
    <div>
      <span className="sr-only">Loading application</span>
      <div aria-hidden="true" className={detailLayout}>
        <div data-skeleton="header" className={`${headerClass} bg-surface`}>
          {/* The h1 is one line: 32px below sm, 40px from sm. */}
          <div data-skeleton="company" className="h-8 sm:h-10">
            <div className={`h-full w-1/2 ${pulse}`} />
          </div>
          {/* The role line: one text-base line (24px). */}
          <div data-skeleton="role" className="mt-1 flex h-6 items-center">
            <div className={`h-4 w-1/3 ${pulse}`} />
          </div>
          <div className={badgeRowClass}>
            {/* No `pulse`: its `rounded` would beat the badge's 6px. */}
            <span
              data-skeleton="badge"
              className="badge w-16 animate-pulse bg-line"
            />
          </div>
          {/* Not interactive: no pointer, no hover. "Archive", as on an
              application that isn't archived. */}
          <div className={actionsRowClass}>
            <span
              data-skeleton="edit"
              className={`${quietButtonClass} pointer-events-none`}
            >
              Edit
            </span>
            <span
              data-skeleton="archive"
              className={`${quietButtonClass} pointer-events-none`}
            >
              Archive
            </span>
            <span
              data-skeleton="delete"
              className={`${quietButtonClass} pointer-events-none text-danger`}
            >
              Delete
            </span>
          </div>
        </div>

        <div data-skeleton="status-form" className={statusFormClass}>
          <span data-skeleton="status-label" className={statusLabelClass}>
            Status
          </span>
          <div className={statusRowClass}>
            {/* The wrapper draws the chevron. The select is as wide as the
                selected status (Chromium, base-select): sized for
                "Wishlist", every new application's status. Its 2.25rem
                right padding (set only on `.field-select > select`) is
                px-3's 0.75rem plus the w-6 spacer. */}
            <span className="field-select">
              <span data-skeleton="status-select" className={statusSelectClass}>
                <span className={textPulse}>Wishlist</span>
                <span className="inline-block w-6" />
              </span>
            </span>
            {/* Disabled at load (the status is unchanged), so 0.6 opacity,
                on a wrapper: button-ink declares opacity itself. */}
            <span className="flex opacity-60">
              <span
                data-skeleton="update-status"
                className={`${inkButtonClass} pointer-events-none`}
              >
                Update status
              </span>
            </span>
          </div>
        </div>

        <dl data-skeleton="dl" className={dlClass}>
          {SKELETON_FIELDS.map(([label, slug, wide]) => {
            const field = (
              <div key={slug} className={fieldClass}>
                <dt data-skeleton={`${slug}-label`} className={termClass}>
                  {label}
                </dt>
                <dd data-skeleton={`${slug}-value`} className={valueClass}>
                  <span className="flex h-5 items-center">
                    <span className={`h-3 w-1/2 ${pulse}`} />
                  </span>
                </dd>
              </div>
            );
            // Full-width fields sit in a col-span wrapper, as on the page.
            return wide ? (
              <div key={slug} className={wideClass}>
                {field}
              </div>
            ) : (
              field
            );
          })}
        </dl>

        <div>
          <div data-skeleton="history-heading" className={historyHeadingClass}>
            Status history
          </div>
          {/* One row: every application has its "Created as" row. */}
          <ol data-skeleton="history" className={historyListClass}>
            <li data-skeleton="history-row" className={historyRowClass}>
              <span className="flex h-5 items-center">
                <span className={`h-3 w-40 ${pulse}`} />
              </span>
              <span className="flex h-4 items-center">
                <span className={`h-3 w-28 ${pulse}`} />
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
