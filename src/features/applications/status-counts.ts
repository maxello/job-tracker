import { Status } from "@/generated/prisma/enums";

// US-6 status counts: how many of the user's applications have each status,
// respecting only "Show archived" (SPEC.md decision log, 2026-11-18).
export type StatusCounts = Record<Status, number>;

// The number alone, so " · " before it stays plain inline text (a leading
// space at the start of an inline-block's line box is removed). 3ch fits one
// to three mono digits, and the skeleton's pulse uses the same width.
export const countNumberClass = "inline-block min-w-[3ch]";

// groupBy returns rows only for statuses that have applications; the others
// count as 0.
export function toStatusCounts(
  rows: { status: Status; _count: { _all: number } }[],
): StatusCounts {
  const counts = Object.fromEntries(
    Object.values(Status).map((status) => [status, 0]),
  ) as StatusCounts;
  for (const row of rows) counts[row.status] = row._count._all;
  return counts;
}

export function hasAnyCount(counts: StatusCounts): boolean {
  return Object.values(counts).some((count) => count > 0);
}
