import { describe, expect, it } from "vitest";
import { toParsedFields } from "./parsed-fields";
import type { ModelOutput } from "./schemas";

// Each parsed field is validated on its own with its US-1 field schema; a
// field that fails is left empty (SPEC.md US-7, decision log 2026-11-23).

const valid: ModelOutput = {
  isJobPosting: true,
  company: "Acme",
  role: "Frontend Engineer",
  location: "Kyiv",
  level: "Senior",
  stack: ["React", "TypeScript"],
  salaryMin: 50000,
  salaryMax: 70000,
  salaryCurrency: "USD",
};

const validFields = {
  company: "Acme",
  role: "Frontend Engineer",
  location: "Kyiv",
  level: "Senior",
  stack: "React, TypeScript",
  salaryMin: "50000",
  salaryMax: "70000",
  salaryCurrency: "USD",
};

const parse = (overrides: Partial<ModelOutput>) =>
  toParsedFields({ ...valid, ...overrides });

describe("toParsedFields (US-7)", () => {
  it("turns valid fields into form strings", () => {
    expect(toParsedFields(valid)).toEqual(validFields);
  });

  it("empties a null company and an empty role, and keeps the rest", () => {
    expect(parse({ company: null, role: "" })).toEqual({
      ...validFields,
      company: "",
      role: "",
    });
  });

  it("empties a company over 200 characters and a level over 100, only those", () => {
    expect(parse({ company: "a".repeat(201), level: "b".repeat(101) })).toEqual(
      { ...validFields, company: "", level: "" },
    );
  });

  it("empties null location and level", () => {
    expect(parse({ location: null, level: null })).toEqual({
      ...validFields,
      location: "",
      level: "",
    });
  });

  it("empties both salaries when min > max", () => {
    expect(
      parse({ salaryMin: 200000, salaryMax: 100000, salaryCurrency: null }),
    ).toEqual({
      ...validFields,
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "",
    });
  });

  it("drops the currency too when min > max empties both salaries", () => {
    expect(
      parse({ salaryMin: 200000, salaryMax: 100000, salaryCurrency: "USD" }),
    ).toEqual({
      ...validFields,
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "",
    });
  });

  it.each([
    ["negative", -1],
    ["not a whole number", 1.5],
    ["over the INTEGER maximum", 2_147_483_648],
  ])("empties a salary that is %s", (_label, salaryMin) => {
    expect(parse({ salaryMin })).toEqual({ ...validFields, salaryMin: "" });
  });

  it("upper-cases the currency", () => {
    expect(parse({ salaryCurrency: "usd" })).toEqual(validFields);
  });

  it("keeps the currency with only one salary value", () => {
    expect(parse({ salaryMin: null })).toEqual({
      ...validFields,
      salaryMin: "",
    });
  });

  it("drops the currency when no salary value is kept", () => {
    expect(parse({ salaryMin: null, salaryMax: -5 })).toEqual({
      ...validFields,
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "",
    });
  });

  it("empties an invalid currency", () => {
    expect(parse({ salaryCurrency: "US" })).toEqual({
      ...validFields,
      salaryCurrency: "",
    });
  });

  it("drops invalid tags and keeps the trimmed valid ones", () => {
    const stack = [
      "React",
      "x".repeat(51),
      "a\u0000b",
      "C, D",
      "",
      "   ",
      " Node ",
    ];
    expect(parse({ stack })).toEqual({ ...validFields, stack: "React, Node" });
  });

  it("caps the stack at the first 30 valid tags", () => {
    const stack = Array.from({ length: 35 }, (_, i) => `tag${i + 1}`);
    expect(parse({ stack }).stack).toBe(stack.slice(0, 30).join(", "));
  });
});
