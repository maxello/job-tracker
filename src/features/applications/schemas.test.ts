import { describe, expect, it } from "vitest";
import { Status } from "@/generated/prisma/enums";
import { changeStatusSchema, createApplicationSchema } from "./schemas";

const required = { company: "Acme", role: "Engineer" };

function parse(fields: Record<string, unknown>) {
  return createApplicationSchema.safeParse({ ...required, ...fields });
}

// Asserts the input is rejected with an error on this field and no other, so a
// test can't pass because of an unrelated failure.
function expectOnlyErrorOn(field: string, fields: Record<string, unknown>) {
  const result = parse(fields);
  expect(result.success).toBe(false);
  expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([field]);
}

function errorMessages(fields: Record<string, unknown>) {
  return parse(fields).error?.issues.map((issue) => issue.message);
}

function expectValid(fields: Record<string, unknown>) {
  const result = parse(fields);
  expect(result.error?.issues).toBeUndefined();
  return result.data;
}

const tags = (count: number) =>
  Array.from({ length: count }, (_, index) => `tag${index}`).join(",");

describe("createApplicationSchema", () => {
  describe.each(["company", "role"])("%s", (field) => {
    it.each([
      ["empty", ""],
      ["whitespace-only", "   "],
      ["missing", undefined],
    ])(`US-1: ${field} is required (%s)`, (_label, value) => {
      expectOnlyErrorOn(field, { [field]: value });
    });

    it.each([1, 200])(`US-1: ${field} accepts %i chars`, (length) => {
      expectValid({ [field]: "a".repeat(length) });
    });

    it(`US-1: ${field} rejects more than 200 chars`, () => {
      expectOnlyErrorOn(field, { [field]: "a".repeat(201) });
    });
  });

  describe("required-field messages", () => {
    it.each([
      ["company", "Company", "empty", ""],
      ["company", "Company", "whitespace-only", "   "],
      ["role", "Role", "empty", ""],
      ["role", "Role", "whitespace-only", "   "],
    ])(
      "US-1: an empty %s error names the field (%s, %s)",
      (field, label, _kind, value) => {
        expect(errorMessages({ [field]: value })).toEqual([
          `${label} is required`,
        ]);
      },
    );
  });

  describe("job URL", () => {
    const prefix = "https://example.com/";

    it.each([
      ["missing", undefined],
      ["empty", ""],
    ])("US-1: job URL is optional (%s)", (_label, url) => {
      expect(expectValid({ url })?.url).toBeUndefined();
    });

    it.each(["http://example.com/jobs/1", "https://example.com/jobs/1"])(
      "US-1: job URL accepts an absolute http or https URL (%s)",
      (url) => {
        expect(expectValid({ url })?.url).toBe(url);
      },
    );

    it.each([
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,hello",
      "ftp://example.com/file",
      "mailto:jobs@example.com",
    ])("US-1: job URL rejects other schemes (%s)", (url) => {
      expectOnlyErrorOn("url", { url });
    });

    it.each(["/jobs/1", "example.com/jobs/1", "http:example.com", "https:/a"])(
      "US-1: job URL must be absolute (%s)",
      (url) => {
        expectOnlyErrorOn("url", { url });
      },
    );

    it("US-1: job URL accepts 2048 chars", () => {
      expectValid({ url: prefix + "a".repeat(2048 - prefix.length) });
    });

    it("US-1: job URL rejects more than 2048 chars", () => {
      expectOnlyErrorOn("url", {
        url: prefix + "a".repeat(2049 - prefix.length),
      });
    });
  });

  describe.each([
    ["notes", 5000],
    ["location", 200],
    ["level", 100],
  ] as const)("%s", (field, max) => {
    it(`US-1: ${field} is optional`, () => {
      expect(expectValid({})?.[field]).toBeUndefined();
    });

    it(`US-1: ${field} accepts ${max} chars`, () => {
      expectValid({ [field]: "a".repeat(max) });
    });

    it(`US-1: ${field} rejects more than ${max} chars`, () => {
      expectOnlyErrorOn(field, { [field]: "a".repeat(max + 1) });
    });
  });

  describe("stack", () => {
    it("US-1: stack is optional", () => {
      expect(expectValid({})?.stack).toEqual([]);
    });

    it("US-1: stack accepts up to 30 tags", () => {
      expect(expectValid({ stack: tags(30) })?.stack).toHaveLength(30);
    });

    it("US-1: stack rejects more than 30 tags", () => {
      expectOnlyErrorOn("stack", { stack: tags(31) });
    });

    it("US-1: a stack tag accepts 50 chars", () => {
      expectValid({ stack: "a".repeat(50) });
    });

    it("US-1: a stack tag rejects more than 50 chars", () => {
      expectOnlyErrorOn("stack", { stack: "a".repeat(51) });
    });
  });

  describe.each(["salaryMin", "salaryMax"] as const)("%s", (field) => {
    it(`US-1: ${field} is optional`, () => {
      expect(expectValid({})?.[field]).toBeUndefined();
    });

    it.each([
      ["0", 0],
      ["50000", 50000],
      ["2147483647", 2147483647],
    ])(`US-1: ${field} accepts the integer %s`, (input, output) => {
      const data = expectValid({ [field]: input, salaryCurrency: "USD" });
      expect(data?.[field]).toBe(output);
    });

    it.each([
      ["a negative number", "-1"],
      ["a decimal", "1000.5"],
      ["text", "a lot"],
      ["a value above 2147483647", "2147483648"],
    ])(`US-1: ${field} rejects %s`, (_label, value) => {
      expectOnlyErrorOn(field, { [field]: value, salaryCurrency: "USD" });
    });

    it.each(["1e9", "0x10"])(
      `Decision 2026-11-05: ${field} accepts decimal digits only (%s)`,
      (value) => {
        expectOnlyErrorOn(field, { [field]: value, salaryCurrency: "USD" });
      },
    );
  });

  describe("salary min and max", () => {
    it.each([
      ["below", "1000", "2000"],
      ["equal to", "2000", "2000"],
    ])("US-1: salary min can be %s salary max", (_label, min, max) => {
      expectValid({ salaryMin: min, salaryMax: max, salaryCurrency: "USD" });
    });

    it("US-1: salary min above salary max is rejected", () => {
      expectOnlyErrorOn("salaryMax", {
        salaryMin: "2001",
        salaryMax: "2000",
        salaryCurrency: "USD",
      });
    });
  });

  describe("salary currency", () => {
    it.each([
      ["salary min", { salaryMin: "1000" }],
      ["salary max", { salaryMax: "1000" }],
      ["both salary values", { salaryMin: "1000", salaryMax: "2000" }],
      ["a salary of 0", { salaryMin: "0" }],
    ])("US-1: salary currency is required with %s", (_label, salary) => {
      expectOnlyErrorOn("salaryCurrency", salary);
    });

    it("US-1: a missing currency error names the field", () => {
      expect(errorMessages({ salaryMin: "1000" })).toEqual([
        "Currency is required when a salary is set",
      ]);
    });

    it("US-1: salary currency is not required without a salary", () => {
      expectValid({});
    });

    it.each(["USD", "EUR", "UAH"])(
      "US-1: salary currency accepts three letters (%s)",
      (salaryCurrency) => {
        const data = expectValid({ salaryMin: "1000", salaryCurrency });
        expect(data?.salaryCurrency).toBe(salaryCurrency);
      },
    );

    it.each(["US", "USDT", "U$D", "840"])(
      "US-1: salary currency rejects a value that is not three letters (%s)",
      (salaryCurrency) => {
        expectOnlyErrorOn("salaryCurrency", {
          salaryMin: "1000",
          salaryCurrency,
        });
      },
    );
  });

  describe("NUL bytes", () => {
    it.each([
      ["company", "Ac\0me"],
      ["role", "Engi\0neer"],
      ["url", "https://example.com/\0"],
      ["notes", "Some\0notes"],
      ["location", "Ky\0iv"],
      ["level", "Sen\0ior"],
      ["stack", "Re\0act"],
    ])("Decision 2026-11-05: %s rejects NUL bytes", (field, value) => {
      expectOnlyErrorOn(field, { [field]: value });
    });
  });

  describe("trimming", () => {
    it.each([
      ["company", "  Acme  ", "Acme"],
      ["role", "\tEngineer\n", "Engineer"],
      ["url", "  https://example.com  ", "https://example.com"],
      ["notes", "  Some notes  ", "Some notes"],
      ["location", "  Kyiv  ", "Kyiv"],
      ["level", "  Senior  ", "Senior"],
    ] as const)(
      "US-1: text inputs are trimmed (%s)",
      (field, input, output) => {
        expect(expectValid({ [field]: input })?.[field]).toBe(output);
      },
    );

    it("US-1: text inputs are trimmed (stack tags)", () => {
      expect(expectValid({ stack: " React ,  Node " })?.stack).toEqual([
        "React",
        "Node",
      ]);
    });

    it.each([
      "url",
      "notes",
      "location",
      "level",
      "salaryMin",
      "salaryMax",
    ] as const)(
      "US-1: a whitespace-only value counts as empty (%s)",
      (field) => {
        expect(expectValid({ [field]: "   " })?.[field]).toBeUndefined();
      },
    );

    it("US-1: a whitespace-only value counts as empty (stack tags)", () => {
      expect(expectValid({ stack: "React,   ,Node" })?.stack).toEqual([
        "React",
        "Node",
      ]);
    });

    it("US-1: a whitespace-only value counts as empty (salary currency)", () => {
      expectOnlyErrorOn("salaryCurrency", {
        salaryMin: "1000",
        salaryCurrency: "   ",
      });
    });
  });
});

// The edit form reuses the US-1 schema; these are the two contracts
// updateApplication relies on.
describe("createApplicationSchema as the US-4 update input", () => {
  it("US-4: cleared optional fields parse to undefined and a cleared stack to []", () => {
    const data = expectValid({
      url: "",
      notes: "  ",
      location: "",
      level: "",
      stack: "",
      salaryMin: "",
      salaryMax: "",
      salaryCurrency: "",
    });

    expect(data).toEqual({ ...required, stack: [] });
  });

  it("US-4: status, owner and archive fields are stripped from the input", () => {
    const data = expectValid({
      status: "OFFER",
      userId: "user-b",
      archivedAt: "2026-11-06",
      createdAt: "2026-11-06",
    });

    expect(data).toEqual({ ...required, stack: [] });
  });
});

describe("changeStatusSchema", () => {
  const id = "application-1";

  it.each(Object.values(Status))(
    "US-3: %s is one of the statuses",
    (status) => {
      expect(changeStatusSchema.safeParse({ id, status }).data).toEqual({
        id,
        status,
      });
    },
  );

  it.each(["ARCHIVED", "", null])(
    "US-3: a value outside the statuses is rejected (%j)",
    (status) => {
      const result = changeStatusSchema.safeParse({ id, status });
      expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
        "status",
      ]);
    },
  );

  it("Decision 2026-11-05: an application id rejects NUL bytes", () => {
    const result = changeStatusSchema.safeParse({
      id: "application\0-1",
      status: "APPLIED",
    });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["id"]);
  });
});
