// The `archived` query value the "Show archived" checkbox submits.
export const SHOW_ARCHIVED_VALUE = "1";

// Parses the `archived` query param: on when any value is "1" after trimming,
// off otherwise. Other values are ignored, with no redirect, like the status
// filter (SPEC.md decision log, 2026-11-12).
export function parseShowArchived(
  value: string | string[] | undefined,
): boolean {
  const values = value === undefined ? [] : [value].flat();
  return values.some((raw) => raw.trim() === SHOW_ARCHIVED_VALUE);
}
