import { Status } from "@/generated/prisma/enums";
import { parseShowArchived, SHOW_ARCHIVED_VALUE } from "./archived-filter";
import { parseDateParam, parseTimeZoneParam } from "./date-filter";
import { parseSearchQuery } from "./search-filter";
import { parseStatusFilter, statusFilterValue } from "./status-filter";

type SearchParam = string | string[] | undefined;
type SearchParams = Record<string, SearchParam>;

// Where the detail and edit pages return to (US-5, US-6, SPEC.md decision
// log, 2026-11-19): the board, or the list with its validated filters.
export type ListReturn =
  | { view: "board" }
  | {
      view: "list";
      statuses: Status[];
      showArchived: boolean;
      q?: string;
      from?: string;
      to?: string;
      tz?: string;
    };

const BOARD_VALUE = "board";

// `view` on the detail and edit pages (US-5): only an exact first value of
// "board" counts, like the list's other parameters. Never a URL.
export function parseView(value: SearchParam): "board" | undefined {
  return [value ?? []].flat()[0] === BOARD_VALUE ? "board" : undefined;
}

// Every value goes through the list's own parsers; anything they ignore is
// dropped, and unknown parameters are never read. `view=board` wins: the
// board has no filters.
export function parseListReturn(params: SearchParams): ListReturn {
  if (parseView(params.view)) return { view: "board" };
  const selected = parseStatusFilter(params.status);
  const target: ListReturn = {
    view: "list",
    // In the form's checkbox order (the enum's), whatever the URL's order.
    statuses: Object.values(Status).filter((status) =>
      selected.includes(status),
    ),
    showArchived: parseShowArchived(params.archived),
  };
  const q = parseSearchQuery(params.q);
  const from = parseDateParam(params.from);
  const to = parseDateParam(params.to);
  // Kept whenever valid: `from` and `to` are read in it.
  const tz = parseTimeZoneParam(params.tz);
  if (q !== undefined) target.q = q;
  if (from !== undefined) target.from = from;
  if (to !== undefined) target.to = to;
  if (tz !== undefined) target.tz = tz;
  return target;
}

// The edit form's hidden `return` input, parsed again with the same rules: it
// came from the client, so it is never trusted. Anything but a string is the
// unfiltered list.
export function parseListReturnQuery(raw: unknown): ListReturn {
  if (typeof raw !== "string") return parseListReturn({});
  const params: SearchParams = {};
  const search = new URLSearchParams(raw);
  for (const key of new Set(search.keys())) params[key] = search.getAll(key);
  return parseListReturn(params);
}

// The canonical query, "" or "?…", built only from parsed values. The order
// is the filter form's (q, status, from, to, tz, archived), for readable
// URLs; nothing depends on it. Defaults are left out.
export function listReturnQuery(target: ListReturn): string {
  const params = new URLSearchParams();
  if (target.view === "board") {
    params.append("view", BOARD_VALUE);
  } else {
    if (target.q !== undefined) params.append("q", target.q);
    for (const status of target.statuses) {
      params.append("status", statusFilterValue(status));
    }
    if (target.from !== undefined) params.append("from", target.from);
    if (target.to !== undefined) params.append("to", target.to);
    if (target.tz !== undefined) params.append("tz", target.tz);
    if (target.showArchived) params.append("archived", SHOW_ARCHIVED_VALUE);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

// The page to return to: always "/" or "/board", never a URL from the client.
export function listReturnHref(target: ListReturn): string {
  return target.view === "board" ? "/board" : `/${listReturnQuery(target)}`;
}
