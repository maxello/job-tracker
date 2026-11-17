import Link from "next/link";

// Empty states shared by the list and the board (US-6 order, US-5).
export const emptyBox =
  "rounded-lg border border-dashed border-control px-4 py-12 text-center";
export const emptyLink =
  "mt-4 inline-block text-sm font-medium underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// State 2: everything the user has is archived. The list links to its own
// "Show archived"; the board, which has none, links to the list's.
export function AllArchived({ href }: { href: string }) {
  return (
    <div className={emptyBox}>
      <p className="text-muted">All your applications are archived.</p>
      <Link href={href} className={emptyLink}>
        Show archived
      </Link>
    </div>
  );
}

// State 3: no applications at all.
export function NoApplications() {
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
