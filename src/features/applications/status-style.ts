import type { Status } from "@/generated/prisma/enums";

// Static class strings per status, so Tailwind sees every class. Colour is
// spent on status only: the row edge, the badge, the filter checkbox, the
// pipeline bar's segments and legend dots (`fill`, US-6), the
// detail page's header card (`panel`: the edge and the card's background, with
// no hover since the card isn't interactive; the background lives here because
// a second bg-* class on the card would compete with Offer's tint). See
// docs/design-brief.md, "Signal". The badge's weight lives here too: bold,
// and semibold for Rejected, as in the design artifact; its shape is the
// `badge` utility.
export const STATUS_STYLES: Record<
  Status,
  { edge: string; panel: string; badge: string; check: string; fill: string }
> = {
  WISHLIST: {
    edge: "border-l-wishlist",
    panel: "border-l-wishlist bg-surface",
    badge: "bg-wishlist-badge font-bold text-wishlist-badge-text",
    check: "text-wishlist",
    fill: "bg-wishlist",
  },
  APPLIED: {
    edge: "border-l-applied",
    panel: "border-l-applied bg-surface",
    badge: "bg-applied-badge font-bold text-applied-badge-text",
    check: "text-applied",
    fill: "bg-applied",
  },
  INTERVIEW: {
    edge: "border-l-interview",
    panel: "border-l-interview bg-surface",
    badge: "bg-interview-badge font-bold text-interview-badge-text",
    check: "text-interview",
    fill: "bg-interview",
  },
  OFFER: {
    edge: "border-l-offer bg-offer-tint hover:bg-offer-tint-hover",
    panel: "border-l-offer bg-offer-tint",
    badge: "bg-offer-badge font-bold text-offer-badge-text",
    check: "text-offer",
    fill: "bg-offer",
  },
  REJECTED: {
    edge: "border-l-rejected",
    panel: "border-l-rejected bg-surface",
    badge: "bg-rejected-badge font-semibold text-rejected-badge-text",
    check: "text-rejected",
    fill: "bg-rejected",
  },
};
