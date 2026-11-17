// The US-1 limit for company and role; also the search input's maxLength.
export const SEARCH_MAX_LENGTH = 200;

// Parses the `q` query param into the search text, or undefined for no search
// (SPEC.md US-6 and the decision log, 2026-11-16). Only the first value
// counts: if it is invalid there is no search, and later values are never
// tried. It is trimmed, and ignored when empty, longer than 200 UTF-16 code
// units (as Zod's `.max` counts) or containing a NUL byte, which Postgres
// can't store in text. Internal whitespace is kept and nothing is normalized.
// LIKE wildcards are returned as typed: the DAL escapes them.
export function parseSearchQuery(
  value: string | string[] | undefined,
): string | undefined {
  const first = value === undefined ? undefined : [value].flat()[0];
  const text = first?.trim();
  if (!text || text.length > SEARCH_MAX_LENGTH || text.includes("\0")) {
    return undefined;
  }
  return text;
}
