import { describe, expect, it } from "vitest";
import { parseSearchQuery } from "./search-filter";

// US-6 `q` parameter (SPEC.md decision log, 2026-11-16). `undefined` means no
// search.

const EMOJI = "😀"; // 2 UTF-16 code units, 1 code point

describe("parseSearchQuery", () => {
  it.each([[undefined], [[]]])(
    "U1 US-6: no value (%j) means no search",
    (value) => {
      expect(parseSearchQuery(value)).toBeUndefined();
    },
  );

  it("U2 US-6: a value is the search text, trimmed", () => {
    expect(parseSearchQuery("acme")).toBe("acme");
    expect(parseSearchQuery("  acme  ")).toBe("acme");
  });

  it.each(["", "   ", "\t\n "])(
    "U3 US-6: an empty or whitespace-only value (%j) means no search",
    (value) => {
      expect(parseSearchQuery(value)).toBeUndefined();
    },
  );

  it("U4 US-6: up to 200 characters, counted after trimming", () => {
    const max = "a".repeat(200);
    expect(parseSearchQuery(max)).toBe(max);
    expect(parseSearchQuery(`  ${max}  `)).toBe(max);
    expect(parseSearchQuery("a".repeat(201))).toBeUndefined();
  });

  it("U5 US-6: the 200 limit counts UTF-16 code units, not code points", () => {
    const max = EMOJI.repeat(100); // 200 units
    expect(parseSearchQuery(max)).toBe(max);
    // 201 units but only 101 code points: code-point counting would keep it.
    expect(parseSearchQuery(`${max}a`)).toBeUndefined();
  });

  it("U6 US-6: a value containing a NUL byte means no search", () => {
    expect(parseSearchQuery("ac\u0000me")).toBeUndefined();
  });

  it("U7 US-6: only the first value counts; later values are never tried", () => {
    expect(parseSearchQuery(["acme", "dev"])).toBe("acme");
    expect(parseSearchQuery(["   ", "dev"])).toBeUndefined();
  });

  it("U8 US-6: internal whitespace is kept and the text isn't normalized", () => {
    expect(parseSearchQuery("acme  corp")).toBe("acme  corp");
    // NFD "e" + combining acute stays as is, not NFC "é".
    expect(parseSearchQuery("é")).toBe("é");
  });

  it("U9 US-6: LIKE wildcards are returned as typed (the DAL escapes them)", () => {
    expect(parseSearchQuery("50%_a\\b")).toBe("50%_a\\b");
  });
});
