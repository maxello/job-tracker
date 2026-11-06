import { describe, expect, it } from "vitest";
import { toFormValues } from "./form-values";
import { createApplicationSchema } from "./schemas";

const empty = {
  company: "Acme",
  role: "Engineer",
  url: null,
  notes: null,
  location: null,
  level: null,
  stack: [],
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
};

const full = {
  company: "Acme",
  role: "Engineer",
  url: "https://example.com/jobs/1",
  notes: "First line\nSecond line",
  location: "Kyiv",
  level: "Senior",
  stack: ["React", "Node"],
  salaryMin: 0,
  salaryMax: 2000,
  salaryCurrency: "USD",
};

describe("toFormValues", () => {
  it("US-4: empty values become empty inputs", () => {
    expect(toFormValues(empty)).toEqual({
      company: "Acme",
      role: "Engineer",
      url: "",
      notes: "",
      location: "",
      level: "",
      stack: "",
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "",
    });
  });

  it("US-4: stack and salary become the text the form submits", () => {
    expect(toFormValues(full)).toMatchObject({
      stack: "React, Node",
      salaryMin: "0",
      salaryMax: "2000",
    });
  });

  it("US-4: saving an unchanged form keeps the same data", () => {
    const { data } = createApplicationSchema.safeParse(toFormValues(full));

    expect(data).toEqual(full);
  });
});
