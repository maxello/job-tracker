// Marks an archived application in the list and on the detail page (US-8).
// Outlined, so it never competes with the status badge's colour.
export function ArchivedBadge() {
  return (
    <span className="badge border border-control font-semibold text-muted">
      Archived
    </span>
  );
}
