import { describe, expect, it } from "vitest";
import type { Status } from "@/generated/prisma/enums";
import { parseStatusFilter } from "./status-filter";

// SPEC.md doesn't fix the output order, so results are compared sorted.
function parsed(value: string | string[] | undefined) {
  return [...parseStatusFilter(value)].sort();
}

function sorted(statuses: Status[]) {
  return [...statuses].sort();
}

describe("parseStatusFilter", () => {
  it("US-6: a single value selects that status", () => {
    expect(parsed("applied")).toEqual(["APPLIED"]);
  });

  it("US-6: a repeated key selects every status given", () => {
    expect(parsed(["applied", "interview"])).toEqual(
      sorted(["APPLIED", "INTERVIEW"]),
    );
  });

  it.each(["Applied", "APPLIED", "aPpLiEd"])(
    "US-6: values are matched case-insensitively (%s)",
    (value) => {
      expect(parsed(value)).toEqual(["APPLIED"]);
    },
  );

  it("US-6: values are trimmed", () => {
    expect(parsed("  applied ")).toEqual(["APPLIED"]);
  });

  it("US-6: unknown values are ignored", () => {
    expect(parsed(["applied", "foo"])).toEqual(["APPLIED"]);
  });

  it("US-6: empty values are ignored", () => {
    expect(parsed(["", "   ", "interview"])).toEqual(["INTERVIEW"]);
  });

  it("US-6: duplicate values are removed", () => {
    expect(parsed(["applied", "APPLIED", " applied "])).toEqual(["APPLIED"]);
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
    ["an empty list", []],
    ["an unknown value", "foo"],
    ["only unknown and empty values", ["foo", ""]],
  ])("US-6: nothing valid means no filter (%s)", (_name, value) => {
    expect(parsed(value)).toEqual([]);
  });

  // The rejected alternative: one comma-separated value.
  it("US-6: a comma-separated value is not split", () => {
    expect(parsed("applied,interview")).toEqual([]);
  });

  // A lookup in a plain object would match inherited keys.
  it.each(["__proto__", "toString", "constructor"])(
    "US-6: an object key name is an unknown value (%s)",
    (value) => {
      expect(parsed(value)).toEqual([]);
    },
  );
});
