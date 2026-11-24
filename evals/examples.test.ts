import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadExamples,
  partialReasons,
  type Example,
  type Label,
} from "./examples";

const label: Label = {
  isJobPosting: true,
  company: "Acme",
  role: "Engineer",
  location: null,
  level: null,
  stack: ["React", "TypeScript"],
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

const TEXT = "Engineer at Acme. SECRETTEXT";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "eval-examples-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string, json: unknown, text = TEXT) {
  writeFileSync(join(dir, `${name}.txt`), text);
  writeFileSync(
    join(dir, `${name}.json`),
    typeof json === "string" ? json : JSON.stringify(json),
  );
}

// The errors of a rejected set; fails when the set loads.
function errorsOf(path = dir): string[] {
  const result = loadExamples(path);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.errors;
}

describe("loadExamples (US-7 eval data)", () => {
  it("loads a pair, with the text trimmed as in the app", () => {
    write("one", { ...label, injection: true }, `\n  ${TEXT} \n`);
    expect(loadExamples(dir)).toEqual({
      ok: true,
      examples: [
        { name: "one", text: TEXT, label: { ...label, injection: true } },
      ],
    });
  });

  it("loads a negative", () => {
    write("neg", negative);
    expect(loadExamples(dir)).toEqual({
      ok: true,
      examples: [{ name: "neg", text: TEXT, label: negative }],
    });
  });

  it("rejects an empty set and a missing directory", () => {
    expect(errorsOf()).toHaveLength(1);
    expect(errorsOf(join(dir, "missing"))).toHaveLength(1);
  });

  it("rejects a .txt without its .json, naming it", () => {
    write("ok", label);
    writeFileSync(join(dir, "lonely.txt"), TEXT);
    expect(errorsOf().join("\n")).toContain("lonely");
  });

  it("rejects a .json without its .txt, naming it", () => {
    write("ok", label);
    writeFileSync(join(dir, "orphan.json"), JSON.stringify(label));
    expect(errorsOf().join("\n")).toContain("orphan");
  });

  it.each([
    ["bad JSON", '{"company": "SECRETTEXT', ""],
    ["an unknown key", { ...label, SECRETTEXT: 1 }, ""],
    ["a missing key", { ...label, role: undefined }, "role"],
    ["a wrong type", { ...label, company: ["SECRETTEXT"] }, "company"],
    ["a salary as text", { ...label, salaryMin: "SECRETTEXT" }, "salaryMin"],
  ])(
    "rejects %s, naming the file and field but none of its content",
    (_name, json, field) => {
      write("broken", json);
      const errors = errorsOf().join("\n");
      expect(errors).toContain("broken");
      expect(errors).toContain(field);
      expect(errors).not.toContain("SECRETTEXT");
    },
  );

  it.each([
    ["empty", ""],
    ["whitespace-only", " \n "],
    ["over 20,000 characters", "x".repeat(20_001)],
  ])("rejects a text that is %s", (_name, text) => {
    write("broken", label, text);
    expect(errorsOf().join("\n")).toContain("broken");
  });

  it("accepts a text of 20,000 characters", () => {
    write("long", label, "x".repeat(20_000));
    expect(loadExamples(dir).ok).toBe(true);
  });

  it.each([
    ["an empty company", { company: "" }, /company/],
    ["a whitespace-only level", { level: "  " }, /level/],
    ["untrimmed text", { company: " Acme " }, /company/],
    ["an empty tag", { stack: [""] }, /stack/],
    ["a whitespace-only tag", { stack: ["   "] }, /stack/],
    ["an empty tag beside a valid one", { stack: ["", "React"] }, /stack/],
    ["an untrimmed tag", { stack: [" React"] }, /stack/],
    ["a tag with a comma", { stack: ["C, D"] }, /stack/],
    [
      "31 tags",
      { stack: Array.from({ length: 31 }, (_, i) => `t${i}`) },
      /stack/,
    ],
    ["min > max", { salaryMin: 80000 }, /salaryMin|salaryMax/],
    [
      "a currency without a salary",
      { salaryMin: null, salaryMax: null },
      /salaryCurrency/,
    ],
    ["a lower-case currency", { salaryCurrency: "usd" }, /salaryCurrency/],
    ["a fractional salary", { salaryMin: 1.5 }, /salaryMin/],
    ["a negative salary", { salaryMin: -1 }, /salaryMin/],
  ])(
    "rejects a label the app's validation would change: %s",
    (_name, part, field) => {
      write("broken", { ...label, ...part });
      const errors = errorsOf().join("\n");
      expect(errors).toContain("broken");
      expect(errors).toMatch(field);
    },
  );

  it.each([
    ["injection on a negative", { ...negative, injection: true }],
    ["injection: false", { ...label, injection: false }],
    ["a negative with a company", { ...negative, company: "Acme" }],
    ["a negative with a salary", { ...negative, salaryMin: 1 }],
    ["a negative with a tag", { ...negative, stack: ["React"] }],
  ])("rejects %s", (_name, json) => {
    write("broken", json);
    expect(errorsOf().join("\n")).toContain("broken");
  });

  it("collects every error, not only the first", () => {
    write("bad-one", { ...label, company: "" });
    write("bad-two", { ...label, salaryCurrency: "usd" });
    writeFileSync(join(dir, "lonely.txt"), TEXT);
    const errors = errorsOf().join("\n");
    expect(errors).toContain("bad-one");
    expect(errors).toContain("bad-two");
    expect(errors).toContain("lonely");
  });

  it("loads a .json with a leading BOM", () => {
    write("bom", `\uFEFF${JSON.stringify(label)}`);
    expect(loadExamples(dir)).toEqual({
      ok: true,
      examples: [{ name: "bom", text: TEXT, label }],
    });
  });

  it("ignores a file that is neither .txt nor .json", () => {
    write("one", label);
    writeFileSync(join(dir, "notes.md"), TEXT);
    expect(loadExamples(dir)).toEqual({
      ok: true,
      examples: [{ name: "one", text: TEXT, label }],
    });
  });

  it("finds the committed format examples valid", () => {
    const result = loadExamples(
      fileURLToPath(new URL("./format-examples", import.meta.url)),
    );
    expect(result.ok).toBe(true);
    expect(
      result.ok ? result.examples.map((e) => e.label.isJobPosting).sort() : [],
    ).toEqual([false, true]);
  });
});

describe("partialReasons (US-7 eval data)", () => {
  function set(postings: number, negatives: number, injected: number) {
    const examples: Example[] = [];
    for (let i = 0; i < postings; i++) {
      examples.push({
        name: `p${i}`,
        text: TEXT,
        label: i < injected ? { ...label, injection: true } : label,
      });
    }
    for (let i = 0; i < negatives; i++) {
      examples.push({ name: `n${i}`, text: TEXT, label: negative });
    }
    return examples;
  }

  it.each([
    [11, 2, 1, 1],
    [12, 2, 1, 0],
    [15, 3, 1, 0],
    [16, 2, 1, 1],
    [12, 1, 1, 1],
    [12, 4, 1, 1],
    [12, 2, 0, 1],
    [12, 2, 2, 1],
    [3, 0, 0, 3],
  ])(
    "%i postings, %i negatives, %i injected: %i reasons",
    (postings, negatives, injected, reasons) => {
      expect(partialReasons(set(postings, negatives, injected))).toHaveLength(
        reasons,
      );
    },
  );
});
