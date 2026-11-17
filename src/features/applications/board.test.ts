import { describe, expect, it } from "vitest";
import {
  applyMove,
  groupByStatus,
  isMove,
  moveMessage,
  type BoardApplication,
} from "./board";

function card(
  id: string,
  status: BoardApplication["status"],
): BoardApplication {
  return {
    id,
    company: `Company ${id}`,
    role: "Frontend Engineer",
    status,
    updatedAt: "2026-11-10T12:00:00.000Z",
  };
}

const ids = (cards: BoardApplication[]) => cards.map(({ id }) => id);

describe("groupByStatus", () => {
  it("U1 US-5: returns all five statuses in enum order, empty ones included, keeping the newest-first input order", () => {
    const columns = groupByStatus([
      card("c", "APPLIED"),
      card("b", "WISHLIST"),
      card("a", "APPLIED"),
    ]);

    expect(Object.keys(columns)).toEqual([
      "WISHLIST",
      "APPLIED",
      "INTERVIEW",
      "OFFER",
      "REJECTED",
    ]);
    expect(ids(columns.WISHLIST)).toEqual(["b"]);
    expect(ids(columns.APPLIED)).toEqual(["c", "a"]);
    expect(columns.INTERVIEW).toEqual([]);
    expect(columns.OFFER).toEqual([]);
    expect(columns.REJECTED).toEqual([]);
  });
});

describe("applyMove", () => {
  it("U2 US-5: the moved card gets its new status and comes first; the others keep their order", () => {
    const before = [
      card("a", "APPLIED"),
      card("b", "WISHLIST"),
      card("c", "WISHLIST"),
    ];

    const after = applyMove(before, { id: "c", to: "APPLIED" });

    expect(after.map(({ id, status }) => [id, status])).toEqual([
      ["c", "APPLIED"],
      ["a", "APPLIED"],
      ["b", "WISHLIST"],
    ]);
    expect(ids(groupByStatus(after).APPLIED)).toEqual(["c", "a"]);
    // The input isn't mutated: useOptimistic replays moves on it.
    expect(before[2]!.status).toBe("WISHLIST");
  });

  it("U3 US-5: two moves of different cards both show, each first in its column", () => {
    const before = [
      card("a", "WISHLIST"),
      card("b", "WISHLIST"),
      card("c", "OFFER"),
    ];

    const after = applyMove(applyMove(before, { id: "a", to: "OFFER" }), {
      id: "b",
      to: "INTERVIEW",
    });
    const columns = groupByStatus(after);

    expect(ids(columns.OFFER)).toEqual(["a", "c"]);
    expect(ids(columns.INTERVIEW)).toEqual(["b"]);
    expect(columns.WISHLIST).toEqual([]);
  });
});

describe("isMove", () => {
  it("U4 US-5: a drop into the card's own column isn't a move; any other column is", () => {
    expect(isMove(card("a", "APPLIED"), "APPLIED")).toBe(false);
    expect(isMove(card("a", "APPLIED"), "OFFER")).toBe(true);
  });
});

describe("moveMessage", () => {
  it("U5 US-5: names the company, the role and the new status label", () => {
    expect(
      moveMessage({ company: "Acme", role: "Frontend Engineer" }, "APPLIED"),
    ).toBe("Moved Acme (Frontend Engineer) to Applied.");
  });
});
