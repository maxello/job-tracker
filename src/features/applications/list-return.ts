import type { Status } from "@/generated/prisma/enums";

type SearchParam = string | string[] | undefined;

// Where the detail and edit pages return to (US-5, US-6): the board, or the
// list with its validated filters.
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

// RED-PHASE STUB: always undefined.
export function parseView(_value: SearchParam): "board" | undefined {
  return undefined;
}

// RED-PHASE STUB: always the unfiltered list.
export function parseListReturn(
  _params: Record<string, SearchParam>,
): ListReturn {
  return { view: "list", statuses: [], showArchived: false };
}

// RED-PHASE STUB: always the unfiltered list.
export function parseListReturnQuery(_raw: unknown): ListReturn {
  return { view: "list", statuses: [], showArchived: false };
}

// RED-PHASE STUB: always no query.
export function listReturnQuery(_target: ListReturn): string {
  return "";
}

// RED-PHASE STUB: always "/".
export function listReturnHref(_target: ListReturn): string {
  return "/";
}
