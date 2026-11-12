// Marks an archived application in the list and on the detail page (US-8).
export function ArchivedBadge() {
  return (
    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
      Archived
    </span>
  );
}
