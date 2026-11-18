import { describe, expect, it } from "vitest";
import { hasAnyCount, toStatusCounts } from "./status-counts";

describe("toStatusCounts", () => {
  it("U1 US-6: groupBy rows for some statuses become all five, with 0 for the missing ones", () => {
    expect(
      toStatusCounts([
        { status: "APPLIED", _count: { _all: 3 } },
        { status: "WISHLIST", _count: { _all: 2 } },
      ]),
    ).toEqual({ WISHLIST: 2, APPLIED: 3, INTERVIEW: 0, OFFER: 0, REJECTED: 0 });
  });
});

describe("hasAnyCount", () => {
  it("U2 US-6: false when every count is 0, true when any count is above 0", () => {
    const zero = {
      WISHLIST: 0,
      APPLIED: 0,
      INTERVIEW: 0,
      OFFER: 0,
      REJECTED: 0,
    };
    expect(hasAnyCount(zero)).toBe(false);
    expect(hasAnyCount({ ...zero, REJECTED: 1 })).toBe(true);
  });
});
