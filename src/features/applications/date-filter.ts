// US-6 date range: `from` and `to` are inclusive days in the `tz` zone (SPEC.md
// section 4 and the decision log, 2026-11-16 and 2026-11-17). No date library:
// the zone's calendar comes from Intl.

// `updatedAt` bounds for the list: `gte` is the start of `from`, `lt` the
// start of the day after `to`, both in the `tz` zone.
export type UpdatedRange = { gte?: Date; lt?: Date };

type CalendarDay = { year: number; month: number; day: number };

const DATE_PARAM = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOUR = 3_600_000;

function first(value: string | string[] | undefined) {
  return value === undefined ? undefined : [value].flat()[0];
}

// A UTC Date for the calendar day. setUTCFullYear, not Date.UTC: Date.UTC maps
// years 0–99 to 1900–1999. Out-of-range parts roll over (Feb 30 → Mar 2), so
// callers compare the result with what they asked for.
function utcMidnight({ year, month, day }: CalendarDay) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

function calendarDayOf(date: Date): CalendarDay {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

// The first `from`/`to` value as given, trimmed, when it is a real calendar
// date in years 0001–9999 written as YYYY-MM-DD; otherwise ignored.
export function parseDateParam(
  value: string | string[] | undefined,
): string | undefined {
  const text = first(value)?.trim();
  const match = text?.match(DATE_PARAM);
  if (!text || !match) return undefined;
  const asked = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (asked.year < 1) return undefined;
  const actual = calendarDayOf(utcMidnight(asked));
  const real =
    actual.year === asked.year &&
    actual.month === asked.month &&
    actual.day === asked.day;
  return real ? text : undefined;
}

// The one place a zone is checked and used: it throws a RangeError for a zone
// Intl doesn't accept, so `parseTimeZone` and `dayStart` can't disagree.
function zoneFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    era: "short",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

// The first `tz` value, trimmed, when Intl accepts it as a time zone
// (aliases, any case, UTC and offsets such as +02:00); otherwise undefined.
export function parseTimeZoneParam(
  value: string | string[] | undefined,
): string | undefined {
  const zone = first(value)?.trim();
  if (!zone || zone.includes("\0")) return undefined;
  try {
    zoneFormatter(zone);
    return zone;
  } catch {
    return undefined;
  }
}

// The zone the list's dates are read in: a valid `tz`, otherwise UTC.
export function parseTimeZone(value: string | string[] | undefined): string {
  return parseTimeZoneParam(value) ?? "UTC";
}

// The local calendar day of `instant` as one comparable number. Intl writes
// 1 BC as year 1 with era BC, so BC years become 1 − year (1 BC → 0).
function localDayKey(formatter: Intl.DateTimeFormat, instant: number) {
  const parts = formatter.formatToParts(instant);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(part("year"));
  const signedYear = part("era").startsWith("B") ? 1 - year : year;
  return (
    signedYear * 10_000 + Number(part("month")) * 100 + Number(part("day"))
  );
}

// The first instant whose local date in the zone is `day` or later. A binary
// search over instants rather than "local midnight minus the offset": it
// handles 23- and 25-hour DST days and days whose midnight is skipped (they
// start at the first instant that exists) without a date library. The ±36 h
// window around UTC midnight is wider than any UTC offset (±14 h today, about
// ±15 h for historical local mean time) plus a day, so the start is always
// inside it.
function startOfDay(day: CalendarDay, timeZone: string): Date {
  const formatter = zoneFormatter(timeZone);
  const target = day.year * 10_000 + day.month * 100 + day.day;
  const midnight = utcMidnight(day).getTime();
  let before = midnight - 36 * HOUR; // local date earlier than `day`
  let atOrAfter = midnight + 36 * HOUR; // local date `day` or later
  while (atOrAfter - before > 1) {
    const middle = Math.floor((before + atOrAfter) / 2);
    if (localDayKey(formatter, middle) >= target) atOrAfter = middle;
    else before = middle;
  }
  return new Date(atOrAfter);
}

function toCalendarDay(date: string): CalendarDay {
  const [year, month, day] = date.split("-").map(Number);
  return { year: year!, month: month!, day: day! };
}

// `date` is a value parseDateParam accepted. Throws a RangeError for a zone
// parseTimeZone would reject.
export function dayStart(date: string, timeZone: string): Date {
  return startOfDay(toCalendarDay(date), timeZone);
}

// The bounds for `updatedAt`. `to` is inclusive, so its bound is the start of
// the next day. `from` later than `to` is kept as given: then gte ≥ lt and
// nothing matches, never a silent swap.
export function dateRange(
  from: string | undefined,
  to: string | undefined,
  timeZone: string,
): UpdatedRange {
  const range: UpdatedRange = {};
  if (from !== undefined) range.gte = dayStart(from, timeZone);
  if (to !== undefined) {
    const next = utcMidnight(toCalendarDay(to));
    next.setUTCDate(next.getUTCDate() + 1);
    range.lt = startOfDay(calendarDayOf(next), timeZone);
  }
  return range;
}
