import type { Status } from "@/generated/prisma/enums";

// Static class strings per status, so Tailwind sees every class. Colour is
// spent on status only: the row edge, the badge, the filter checkbox, the
// detail page's header card (`panel`: the edge and the card's background, with
// no hover since the card isn't interactive; the background lives here because
// a second bg-* class on the card would compete with Offer's tint). See
// docs/design-brief.md, "Signal".
export const STATUS_STYLES: Record<
  Status,
  { edge: string; panel: string; badge: string; check: string }
> = {
  WISHLIST: {
    edge: "border-l-wishlist",
    panel: "border-l-wishlist bg-surface",
    badge: "bg-wishlist-badge text-wishlist-badge-text",
    check: "text-wishlist",
  },
  APPLIED: {
    edge: "border-l-applied",
    panel: "border-l-applied bg-surface",
    badge: "bg-applied-badge text-applied-badge-text",
    check: "text-applied",
  },
  INTERVIEW: {
    edge: "border-l-interview",
    panel: "border-l-interview bg-surface",
    badge: "bg-interview-badge text-interview-badge-text",
    check: "text-interview",
  },
  OFFER: {
    edge: "border-l-offer bg-offer-tint hover:bg-offer-tint-hover",
    panel: "border-l-offer bg-offer-tint",
    badge: "bg-offer-badge text-offer-badge-text",
    check: "text-offer",
  },
  REJECTED: {
    edge: "border-l-rejected",
    panel: "border-l-rejected bg-surface",
    badge: "bg-rejected-badge text-rejected-badge-text",
    check: "text-rejected",
  },
};
