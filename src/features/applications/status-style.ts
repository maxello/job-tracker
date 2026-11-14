import type { Status } from "@/generated/prisma/enums";

// Static class strings per status, so Tailwind sees every class. Colour is
// spent on status only: the row edge, the badge, the filter checkbox
// (docs/design-brief.md, "Signal").
export const STATUS_STYLES: Record<
  Status,
  { edge: string; badge: string; check: string }
> = {
  WISHLIST: {
    edge: "border-l-wishlist",
    badge: "bg-wishlist-badge text-wishlist-badge-text",
    check: "text-wishlist",
  },
  APPLIED: {
    edge: "border-l-applied",
    badge: "bg-applied-badge text-applied-badge-text",
    check: "text-applied",
  },
  INTERVIEW: {
    edge: "border-l-interview",
    badge: "bg-interview-badge text-interview-badge-text",
    check: "text-interview",
  },
  OFFER: {
    edge: "border-l-offer bg-offer-tint hover:bg-offer-tint-hover",
    badge: "bg-offer-badge text-offer-badge-text",
    check: "text-offer",
  },
  REJECTED: {
    edge: "border-l-rejected",
    badge: "bg-rejected-badge text-rejected-badge-text",
    check: "text-rejected",
  },
};
