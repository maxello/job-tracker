import Link from "next/link";

// Empty states shared by the list and the board (US-6 order, US-5).
export const emptyBox =
  "rounded-lg border border-dashed border-control px-4 py-12 text-center";
// The board focuses the text when a move empties it (US-5): tabIndex -1
// makes it focusable from code only, never a Tab stop.
const emptyText =
  "text-muted focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const focusProps = (focusable: boolean | undefined) =>
  focusable ? { tabIndex: -1 } : {};

export const emptyLink =
  "mt-4 inline-block text-sm font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// State 2: everything the user has is archived. The list links to its own
// "Show archived"; the board, which has none, links to the list's.
export function AllArchived({
  href,
  focusable,
}: {
  href: string;
  focusable?: boolean;
}) {
  return (
    <div className={emptyBox}>
      <p className={emptyText} {...focusProps(focusable)}>
        All your applications are archived.
      </p>
      <Link href={href} className={emptyLink}>
        Show archived
      </Link>
    </div>
  );
}

// State 3: no applications at all.
export function NoApplications({ focusable }: { focusable?: boolean } = {}) {
  return (
    <div className={emptyBox}>
      <p className={emptyText} {...focusProps(focusable)}>
        No applications yet.
      </p>
      <Link
        href="/applications/new"
        className="button-ink mt-4 px-4 py-2 text-sm"
      >
        Add your first application
      </Link>
    </div>
  );
}
