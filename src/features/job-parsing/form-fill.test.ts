import { describe, expect, it } from "vitest";
import { fillParsedFields, hasParsedValue } from "./form-fill";
import { PARSED_FIELD_NAMES, type ParsedFields } from "./schemas";

// The 10 form fields as a plain map, standing in for the form's inputs.
function fakeForm(values: Record<string, string> = {}) {
  const form: Record<string, string> = {
    company: "",
    role: "",
    url: "",
    notes: "",
    location: "",
    level: "",
    stack: "",
    salaryMin: "",
    salaryMax: "",
    salaryCurrency: "",
    ...values,
  };
  return {
    form,
    read: (name: string) => form[name] ?? "",
    write: (name: string, value: string) => {
      form[name] = value;
    },
  };
}

const parsed: ParsedFields = {
  company: "Acme",
  role: "Frontend Engineer",
  location: "Remote",
  level: "",
  stack: "React, TypeScript",
  salaryMin: "100000",
  salaryMax: "120000",
  salaryCurrency: "USD",
};

describe("fillParsedFields", () => {
  it("FF1 US-7: writes the 8 parsed fields, '' for an empty one, and never touches Job URL or Notes", () => {
    const { form, write } = fakeForm({
      url: "https://example.com/job",
      notes: "My notes",
      level: "Junior",
      company: "Old Co",
    });

    fillParsedFields(write, parsed);

    expect(form).toEqual({
      ...parsed,
      url: "https://example.com/job",
      notes: "My notes",
    });
  });
});

describe("hasParsedValue", () => {
  it("FF2 US-7: false when the 8 parsed fields are empty or whitespace-only, even with Job URL and Notes set", () => {
    const { read } = fakeForm({
      url: "https://example.com/job",
      notes: "My notes",
      company: "   ",
      stack: "\t",
    });

    expect(hasParsedValue(read)).toBe(false);
  });

  it.each(PARSED_FIELD_NAMES)("FF2 US-7: true when only %s is set", (name) => {
    const { read } = fakeForm({ [name]: " x " });

    expect(hasParsedValue(read)).toBe(true);
  });
});
