import { describe, expect, it } from "vitest";
import { parseShowArchived } from "./archived-filter";

// `?archived=1` turns "Show archived" on (SPEC.md decision log, 2026-11-12).
describe("parseShowArchived", () => {
  it.each(["1", " 1 "])("US-8: archived=%j turns Show archived on", (value) => {
    expect(parseShowArchived(value)).toBe(true);
  });

  it.each([undefined, "", "0", "true", "yes", "on"])(
    "US-8: archived=%j leaves Show archived off",
    (value) => {
      expect(parseShowArchived(value)).toBe(false);
    },
  );

  it("US-8: with a repeated key, any 1 turns it on", () => {
    expect(parseShowArchived(["0", "1"])).toBe(true);
  });

  it("US-8: a repeated key with no 1 leaves it off", () => {
    expect(parseShowArchived(["0", "yes"])).toBe(false);
  });
});
