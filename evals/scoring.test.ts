import { describe, expect, it } from "vitest";
import type { ParseFailureCategory } from "@/features/job-parsing/client";
import {
  PARSED_FIELD_NAMES,
  type ParsedFields,
} from "@/features/job-parsing/schemas";
import type { Label } from "./examples";
import {
  accuracyOf,
  matchField,
  meanAccuracy,
  meetsTarget,
  ratio,
  scoreExample,
  TARGETS,
  type Outcome,
} from "./scoring";

const posting: Label = {
  isJobPosting: true,
  company: "Acme",
  role: "Engineer",
  location: null,
  level: null,
  stack: ["React"],
  salaryMin: 60000,
  salaryMax: 72000,
  salaryCurrency: "USD",
};

const negative: Label = {
  isJobPosting: false,
  company: null,
  role: null,
  location: null,
  level: null,
  stack: [],
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
};

const perfect: ParsedFields = {
  company: "Acme",
  role: "Engineer",
  location: "",
  level: "",
  stack: "React",
  salaryMin: "60000",
  salaryMax: "72000",
  salaryCurrency: "USD",
};

const match = (
  name: (typeof PARSED_FIELD_NAMES)[number],
  expected: Partial<Label>,
  actual: Partial<ParsedFields>,
) => matchField(name, { ...posting, ...expected }, { ...perfect, ...actual });

const parsed = (
  isJobPosting: boolean,
  fields: Partial<ParsedFields> = {},
): Outcome => ({
  kind: "parsed",
  isJobPosting,
  fields: { ...perfect, ...fields },
});

const all = (value: boolean) =>
  Object.fromEntries(PARSED_FIELD_NAMES.map((name) => [name, value]));

describe("matchField (US-7 eval)", () => {
  it.each([
    ["equal", "Acme", "Acme", true],
    ["case", "Acme", "aCME", true],
    ["outer whitespace", "Acme", "  Acme ", true],
    ["inner whitespace", "Acme  Corp", "acme \t corp", true],
    ["different text", "Acme", "Acme Inc", false],
    ["expected null, actual empty", null, "", true],
    ["expected null, actual value", null, "Acme", false],
    ["expected value, actual empty", "Acme", "", false],
  ])("compares text: %s", (_label, expected, actual, result) => {
    expect(match("company", { company: expected }, { company: actual })).toBe(
      result,
    );
  });

  it.each([
    ["usd", true],
    ["EUR", false],
    ["", false],
  ])("compares the currency as text: %j", (actual, result) => {
    expect(match("salaryCurrency", {}, { salaryCurrency: actual })).toBe(
      result,
    );
  });

  it.each([
    [60000, "60000", true],
    [60000, "060000", true],
    [60000, "60001", false],
    [60000, "", false],
    [null, "", true],
    [null, "0", false],
    [0, "", false],
    [0, "0", true],
  ])("compares salaries as numbers: %s vs %j", (expected, actual, result) => {
    expect(
      match("salaryMin", { salaryMin: expected }, { salaryMin: actual }),
    ).toBe(result);
    expect(
      match("salaryMax", { salaryMax: expected }, { salaryMax: actual }),
    ).toBe(result);
  });

  it.each([
    ["Jaccard exactly 0.8", ["a", "b", "c", "d", "e"], "a, b, c, d", true],
    ["Jaccard 0.75", ["a", "b", "c", "d"], "a, b, c", false],
    ["two empty sets", [], "", true],
    ["expected empty", [], "a", false],
    ["actual empty", ["a"], "", false],
    ["case and whitespace", ["React  Native"], "react native", true],
    ["order", ["a", "b"], "b, a", true],
    ["duplicates", ["a", "b"], "a, A, b", true],
  ])("compares the stack: %s", (_label, expected, actual, result) => {
    expect(match("stack", { stack: expected }, { stack: actual })).toBe(result);
  });
});

describe("scoreExample (US-7 eval)", () => {
  it("scores each field on its own", () => {
    expect(
      scoreExample(posting, parsed(true, { salaryMax: "1", role: "Other" })),
    ).toEqual({
      kind: "scored",
      flag: true,
      fields: { ...all(true), salaryMax: false, role: false },
    });
  });

  it("misses all 8 fields and the flag when isJobPosting is false on a posting", () => {
    expect(scoreExample(posting, parsed(false))).toEqual({
      kind: "scored",
      flag: false,
      fields: all(false),
    });
  });

  it.each<ParseFailureCategory>([
    "timeout",
    "refusal",
    "context_window",
    "invalid_output",
  ])("scores %s as misses", (category) => {
    const outcome: Outcome = { kind: "failed", category };
    expect(scoreExample(posting, outcome)).toEqual({
      kind: "scored",
      flag: false,
      fields: all(false),
    });
    expect(scoreExample(negative, outcome)).toEqual({
      kind: "scored",
      flag: false,
      fields: null,
    });
  });

  it.each<ParseFailureCategory>([
    "api_bad_request",
    "api_auth",
    "api_rate_limited",
    "api_server",
    "api_connection",
    "api_error",
    "unexpected",
  ])("doesn't score %s", (category) => {
    expect(scoreExample(posting, { kind: "failed", category })).toEqual({
      kind: "unscored",
      category,
    });
    expect(scoreExample(negative, { kind: "failed", category })).toEqual({
      kind: "unscored",
      category,
    });
  });

  it.each([
    [false, true],
    [true, false],
  ])(
    "scores only the flag of a negative: output %s gives %s",
    (isJobPosting, flag) => {
      expect(scoreExample(negative, parsed(isJobPosting))).toEqual({
        kind: "scored",
        flag,
        fields: null,
      });
    },
  );
});

describe("accuracy (US-7 eval)", () => {
  it("counts hits and totals per field, without negatives and unscored examples", () => {
    const scores = [
      scoreExample(posting, parsed(true)),
      scoreExample(posting, parsed(true, { company: "Other" })),
      scoreExample(posting, { kind: "failed", category: "timeout" }),
      scoreExample(posting, { kind: "failed", category: "api_server" }),
      scoreExample(negative, parsed(false)),
      scoreExample(negative, parsed(true)),
    ];
    const accuracy = accuracyOf(scores);
    expect(accuracy.fields.company).toEqual({ hits: 1, total: 3 });
    for (const name of PARSED_FIELD_NAMES.slice(1)) {
      expect(accuracy.fields[name]).toEqual({ hits: 2, total: 3 });
    }
    expect(accuracy.flag).toEqual({ hits: 3, total: 5 });
  });

  it("gives null, not 0 or NaN, when nothing was scored", () => {
    expect(ratio({ hits: 0, total: 0 })).toBeNull();
    expect(ratio({ hits: 0, total: 4 })).toBe(0);
    expect(ratio({ hits: 3, total: 4 })).toBe(0.75);
  });

  it("means three runs", () => {
    expect(
      meanAccuracy([
        { hits: 10, total: 10 },
        { hits: 9, total: 10 },
        { hits: 8, total: 10 },
      ]),
    ).toEqual({ hits: 27, total: 30 });
  });
});

describe("targets (US-7 eval)", () => {
  it("are 90% for company and role, 70% for the rest", () => {
    expect(TARGETS).toEqual({
      company: 0.9,
      role: 0.9,
      location: 0.7,
      level: 0.7,
      stack: 0.7,
      salaryMin: 0.7,
      salaryMax: 0.7,
      salaryCurrency: 0.7,
    });
  });

  it.each([
    ["company", 27, 30, true],
    ["company", 26, 30, false],
    ["role", 27, 30, true],
    ["location", 21, 30, true],
    ["location", 20, 30, false],
    // 89.96%: shown as 90.0%, but the comparison is unrounded.
    ["company", 2249, 2500, false],
    ["company", 0, 0, false],
  ] as const)(
    "compares %s %i/%i unrounded: %s",
    (name, hits, total, result) => {
      expect(meetsTarget(name, { hits, total })).toBe(result);
    },
  );
});
