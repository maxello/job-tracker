import { describe, expect, it } from "vitest";
import type { ParsedFields } from "@/features/job-parsing/schemas";
import type { Example, Label } from "./examples";
import { reportLines } from "./report";
import type { EvalResult, Run } from "./run";
import type { Outcome, Score } from "./scoring";
import type { Usage } from "./usage";

const SENTINEL = "POSTING-TEXT-SENTINEL";

const label: Label = {
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

const negativeLabel: Label = {
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

const fields: ParsedFields = {
  company: "Acme",
  role: "Engineer",
  location: "",
  level: "",
  stack: "React",
  salaryMin: "60000",
  salaryMax: "72000",
  salaryCurrency: "USD",
};

type FieldScores = NonNullable<Extract<Score, { kind: "scored" }>["fields"]>;

const allFields = (value: boolean): FieldScores => ({
  company: value,
  role: value,
  location: value,
  level: value,
  stack: value,
  salaryMin: value,
  salaryMax: value,
  salaryCurrency: value,
});

const example = (name: string, l: Label): Example => ({
  name,
  text: SENTINEL,
  label: l,
});

const one = example("p-one", { ...label, injection: true });
const two = example("p-two", label);
const neg = example("n-one", negativeLabel);
const examples = [one, two, neg];

// An outcome with its score written out, so these tests don't depend on
// scoring.ts being right.
type Result = { outcome: Outcome; score: Score };

const parsed = (
  isJobPosting: boolean,
  changes: Partial<ParsedFields>,
  score: Score,
): Result => ({
  outcome: {
    kind: "parsed",
    isJobPosting,
    fields: { ...fields, ...changes },
  },
  score,
});

const hit = (e: Example): Result =>
  parsed(
    e.label.isJobPosting,
    {},
    {
      kind: "scored",
      flag: true,
      fields: e.label.isJobPosting ? allFields(true) : null,
    },
  );

// A posting with these fields wrong.
const wrong = (changes: Partial<ParsedFields>): Result =>
  parsed(true, changes, {
    kind: "scored",
    flag: true,
    fields: {
      ...allFields(true),
      ...Object.fromEntries(Object.keys(changes).map((key) => [key, false])),
    },
  });

const wrongFlag = (e: Example): Result =>
  parsed(
    !e.label.isJobPosting,
    {},
    {
      kind: "scored",
      flag: false,
      fields: e.label.isJobPosting ? allFields(false) : null,
    },
  );

const failed = (
  category: "timeout" | "refusal" | "invalid_output",
  e: Example,
): Result => ({
  outcome: { kind: "failed", category },
  score: {
    kind: "scored",
    flag: false,
    fields: e.label.isJobPosting ? allFields(false) : null,
  },
});

const unscored = (category: "api_server" | "api_auth"): Result => ({
  outcome: { kind: "failed", category },
  score: { kind: "unscored", category },
});

// One run; `changes` replaces the hit of an example.
function run(
  changes: Record<string, Result> = {},
  usage: Usage = { input: 1000, output: 500, unknown: 0 },
): Run {
  return {
    usage,
    results: examples.map((e) => ({
      example: e,
      ...(changes[e.name] ?? hit(e)),
    })),
  };
}

function report(
  runs: Run[],
  options: { partial?: string[]; complete?: boolean; model?: string } = {},
) {
  const result: EvalResult = { runs, complete: options.complete ?? true };
  return reportLines({
    model: options.model ?? "claude-haiku-5-5",
    examples,
    partial: options.partial ?? [],
    result,
  });
}

// The only line starting with `start`.
function line(lines: string[], start: string) {
  const found = lines.filter((l) => l.startsWith(start));
  expect(found, `lines starting with "${start}"`).toHaveLength(1);
  return found[0];
}

describe("reportLines, complete (US-7 eval)", () => {
  const lines = () =>
    report([
      run(),
      run({ "p-one": wrong({ company: "Other" }) }),
      run({ "p-two": failed("timeout", two) }),
    ]);

  it("says what was loaded and the model id", () => {
    expect(line(lines(), "Loaded:")).toBe(
      "Loaded: 2 postings (1 injected), 1 negatives",
    );
    expect(line(lines(), "Model:")).toBe("Model: claude-haiku-5-5");
  });

  it("shows each run, the mean, the target and pass or miss per field", () => {
    // company: 2/2, 1/2, 1/2 is 4/6, under 90%.
    expect(line(lines(), "company ")).toMatch(
      /2\/2 100\.0%.*1\/2 50\.0%.*1\/2 50\.0%.*mean 66\.7%.*target 90%.*MISS/,
    );
    // location: 2/2, 2/2, 1/2 is 5/6, over 70%.
    expect(line(lines(), "location ")).toMatch(
      /2\/2 100\.0%.*2\/2 100\.0%.*1\/2 50\.0%.*mean 83\.3%.*target 70%.*PASS/,
    );
  });

  it.each([
    "company",
    "role",
    "location",
    "level",
    "stack",
    "salaryMin",
    "salaryMax",
    "salaryCurrency",
  ])("has a row with a target for %s", (name) => {
    expect(line(lines(), `${name} `)).toContain("target");
  });

  it("shows the isJobPosting accuracy with no target", () => {
    const flag = line(lines(), "isJobPosting ");
    expect(flag).toMatch(
      /3\/3 100\.0%.*3\/3 100\.0%.*2\/3 66\.7%.*mean 88\.9%/,
    );
    expect(flag).not.toContain("target");
  });

  it("prints the timeouts per run", () => {
    expect(line(lines(), "Timeouts:")).toBe(
      "Timeouts: run 1: 0, run 2: 0, run 3: 1",
    );
  });

  it("doesn't call a complete set partial or incomplete", () => {
    const text = lines().join("\n");
    expect(text).toContain("company");
    expect(text).not.toMatch(/partial|incomplete/i);
  });
});

describe("reportLines, partial and incomplete (US-7 eval)", () => {
  it("marks each run of a partial set, says why, and gives no mean or target", () => {
    const text = report([run(), run(), run()], {
      partial: ["2 postings, expected 12-15"],
    }).join("\n");
    expect(text).toContain("2 postings, expected 12-15");
    for (const n of [1, 2, 3]) expect(text).toContain(`run ${n} (partial)`);
    expect(text).toContain("2/2 100.0%");
    expect(text).not.toMatch(/mean|target|PASS|MISS/);
  });

  it("marks each run of an incomplete command, lists the errors, and gives no mean or target", () => {
    const lines = report(
      [run(), run({ "p-two": unscored("api_server") }), run()],
      { complete: false },
    );
    const text = lines.join("\n");
    for (const n of [1, 2, 3]) {
      expect(text).toContain(`run ${n} (incomplete)`);
    }
    expect(lines).toContain("Not scored: p-two, run 2: api_server");
    expect(text).toContain("1/1 100.0%");
    expect(text).not.toMatch(/mean|target|PASS|MISS/);
  });

  it("marks a set that is both partial and incomplete as both", () => {
    const lines = report(
      [run(), run({ "p-two": unscored("api_server") }), run()],
      { partial: ["2 postings, expected 12-15"], complete: false },
    );
    const text = lines.join("\n");
    for (const n of [1, 2, 3]) {
      expect(text).toContain(`run ${n} (partial, incomplete)`);
    }
    expect(text).toContain("2 postings, expected 12-15");
    expect(lines).toContain("Not scored: p-two, run 2: api_server");
    expect(text).not.toMatch(/mean|target|PASS|MISS/);
  });

  it("shows n/a when nothing in a run was scored", () => {
    const none = {
      "p-one": unscored("api_auth"),
      "p-two": unscored("api_auth"),
      "n-one": unscored("api_auth"),
    };
    const text = report([run(none), run(none), run(none)], {
      complete: false,
    }).join("\n");
    expect(text).toContain("n/a");
    expect(text).not.toContain("NaN");
  });
});

describe("reportLines, mismatches (US-7 eval)", () => {
  it("lists example, run, field, expected and actual", () => {
    const lines = report([
      run(),
      run({
        "p-one": wrong({
          company: "Other",
          location: "Kyiv",
          stack: "Vue, Go",
          salaryMin: "",
        }),
      }),
      run(),
    ]);
    expect(lines.filter((l) => l.startsWith("p-one, run 2"))).toEqual([
      'p-one, run 2, company: expected "Acme", actual "Other"',
      'p-one, run 2, location: expected null, actual "Kyiv"',
      'p-one, run 2, stack: expected ["React"], actual ["Vue","Go"]',
      "p-one, run 2, salaryMin: expected 60000, actual null",
    ]);
  });

  it("lists a negative's isJobPosting miss", () => {
    const lines = report([run({ "n-one": wrongFlag(neg) }), run(), run()]);
    expect(lines.filter((l) => l.startsWith("n-one, run"))).toEqual([
      "n-one, run 1, isJobPosting: expected false, actual true",
    ]);
  });

  it("gives a false isJobPosting on a posting one line", () => {
    const lines = report([run({ "p-one": wrongFlag(one) }), run(), run()]);
    expect(lines.filter((l) => l.startsWith("p-one, run"))).toEqual([
      "p-one, run 1, isJobPosting: expected true, actual false",
    ]);
  });

  it("gives a scored failure one line with its category", () => {
    const lines = report([
      run({
        "p-one": failed("refusal", one),
        "n-one": failed("invalid_output", neg),
      }),
      run(),
      run(),
    ]);
    expect(lines.filter((l) => l.startsWith("p-one, run"))).toEqual([
      "p-one, run 1: failed (refusal)",
    ]);
    expect(lines.filter((l) => l.startsWith("n-one, run"))).toEqual([
      "n-one, run 1: failed (invalid_output)",
    ]);
  });

  it("never prints the posting text", () => {
    const text = report(
      [
        run({ "p-one": wrong({ company: "Other" }) }),
        run({ "p-one": failed("timeout", one) }),
        run({ "p-one": unscored("api_server") }),
      ],
      { complete: false },
    ).join("\n");
    expect(text).toContain("p-one");
    expect(text).not.toContain(SENTINEL);
  });
});

describe("reportLines, tokens and cost (US-7 eval)", () => {
  const usage = { input: 1_000_000, output: 100_000, unknown: 0 };

  it("shows tokens and cost per run and in total, with the checked date", () => {
    const lines = report([run({}, usage), run({}, usage), run({}, usage)]);
    expect(line(lines, "Run 1:")).toBe(
      "Run 1: 1000000 in, 100000 out, $0.1500",
    );
    expect(line(lines, "Total:")).toBe(
      "Total: 3000000 in, 300000 out, $0.4500 (prices checked 2026-11-23)",
    );
    expect(lines.join("\n")).not.toContain("≥");
  });

  it("shows a lower bound and the count when some usage is unknown", () => {
    const lines = report([
      run({}, usage),
      run({}, { ...usage, unknown: 2 }),
      run({}, usage),
    ]);
    expect(line(lines, "Run 1:")).not.toContain("≥");
    expect(line(lines, "Run 2:")).toBe(
      "Run 2: ≥ 1000000 in, ≥ 100000 out, ≥ $0.1500 (unknown usage: 2)",
    );
    expect(line(lines, "Total:")).toBe(
      "Total: ≥ 3000000 in, ≥ 300000 out, ≥ $0.4500 (unknown usage: 2) (prices checked 2026-11-23)",
    );
  });

  it("shows tokens and no cost for an unknown model", () => {
    const lines = report([run(), run(), run()], { model: "other-model" });
    expect(line(lines, "Total:")).toBe("Total: 3000 in, 1500 out");
    expect(lines.join("\n")).not.toContain("$");
  });
});
