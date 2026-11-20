import { listReturnHref, type ListReturn } from "../list-return";
import { ArrowIcon } from "./arrow-icon";
import { BackLinkAnchor, type BackLinkHandoff } from "./back-link-anchor";

const UNFILTERED: ListReturn = {
  view: "list",
  statuses: [],
  showArchived: false,
};

// The back arrow and the view the user came from, at the top of the detail,
// new, edit and not-found pages: "Applications" → / by default, or with the
// list's filters; "Board" → /board on a detail or edit page opened from the
// board (US-5, US-6). The href comes from listReturnHref, so it is always /
// or /board. The arrow is decoration, so the link's name is the label.
// `handoff` hands keyboard focus from a <Suspense> fallback to the real link
// ("give" on the fallback, "take" on the link that replaces it; see
// BackLinkAnchor).
export function BackLink({
  to,
  handoff,
}: { to?: "board" | ListReturn; handoff?: BackLinkHandoff } = {}) {
  const target: ListReturn =
    to === "board" ? { view: "board" } : (to ?? UNFILTERED);
  const href = listReturnHref(target);
  const label = target.view === "board" ? "Board" : "Applications";
  return (
    <BackLinkAnchor
      handoff={handoff}
      href={href}
      transitionTypes={["nav-back"]}
      className="inline-flex items-center gap-1 text-sm font-medium text-text underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <ArrowIcon direction="left" />
      {label}
    </BackLinkAnchor>
  );
}
