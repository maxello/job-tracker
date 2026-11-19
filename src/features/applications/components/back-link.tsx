import Link from "next/link";
import type { ListReturn } from "../list-return";
import { ArrowIcon } from "./arrow-icon";

type SearchParam = string | string[] | undefined;

// `from` on the detail page (US-5): only an exact first value of "board"
// counts, like the list's other parameters; anything else is the list. Never
// a URL, so it can't become an open redirect.
export function parseFrom(value: SearchParam): "board" | undefined {
  return [value ?? []].flat()[0] === "board" ? "board" : undefined;
}

const TARGETS = {
  list: { href: "/", label: "Applications" },
  board: { href: "/board", label: "Board" },
} as const;

// The back arrow and the view the user came from, at the top of the detail,
// new, edit and not-found pages: "Applications" → / by default, "Board" →
// /board on a detail page opened from the board. The arrow is decoration, so
// the link's name is the label.
// RED-PHASE STUB: `to` accepts a ListReturn but ignores it.
export function BackLink({ to }: { to?: "board" | ListReturn } = {}) {
  const { href, label } = TARGETS[to === "board" ? "board" : "list"];
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ArrowIcon direction="left" />
      {label}
    </Link>
  );
}
