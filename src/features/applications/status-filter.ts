import { Status } from "@/generated/prisma/enums";

// Lowercase URL value → status. A Map, not a plain object, so inherited keys
// like `__proto__` or `toString` never match.
const STATUS_BY_VALUE = new Map<string, Status>(
  Object.values(Status).map((status) => [status.toLowerCase(), status]),
);

// The URL value for a status, as the filter form submits it.
export function statusFilterValue(status: Status) {
  return status.toLowerCase();
}

// Parses the `status` query param (one key repeated, lowercase values) into
// the selected statuses. See the SPEC.md decision log, 2026-11-11.
// Values are trimmed and matched case-insensitively; unknown, empty and
// duplicate values are ignored. An empty result means no filter.
export function parseStatusFilter(
  value: string | string[] | undefined,
): Status[] {
  const values = value === undefined ? [] : [value].flat();
  const statuses = new Set<Status>();
  for (const raw of values) {
    const status = STATUS_BY_VALUE.get(raw.trim().toLowerCase());
    if (status) statuses.add(status);
  }
  return [...statuses];
}
