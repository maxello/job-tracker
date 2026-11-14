// Marks an archived application in the list and on the detail page (US-8).
// Outlined, so it never competes with the status badge's colour.
export function ArchivedBadge() {
  return (
    <span className="rounded-full border border-control px-2 py-0.5 text-xs font-medium text-muted">
      Archived
    </span>
  );
}
