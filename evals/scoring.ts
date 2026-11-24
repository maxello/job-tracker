import type { ParseFailureCategory } from "@/features/job-parsing/client";
import {
  PARSED_FIELD_NAMES,
  type ParsedFieldName,
  type ParsedFields,
} from "@/features/job-parsing/schemas";
import type { Label } from "./examples";

// The eval's metric (SPEC.md US-7, decision log 2026-11-23 and 2026-11-24).

export type Outcome =
  | { kind: "parsed"; isJobPosting: boolean; fields: ParsedFields }
  | { kind: "failed"; category: ParseFailureCategory };

// `fields` is null for a text that is not a job posting.
export type Score =
  | { kind: "unscored"; category: ParseFailureCategory }
  | {
      kind: "scored";
      flag: boolean;
      fields: Record<ParsedFieldName, boolean> | null;
    };

export type Accuracy = { hits: number; total: number };

export type RunAccuracy = {
  fields: Record<ParsedFieldName, Accuracy>;
  flag: Accuracy;
};

export const TARGETS: Record<ParsedFieldName, number> = {
  company: 0.9,
  role: 0.9,
  location: 0.7,
  level: 0.7,
  stack: 0.7,
  salaryMin: 0.7,
  salaryMax: 0.7,
  salaryCurrency: 0.7,
};

const MIN_JACCARD = 0.8;

// Failures where the user gets nothing because of the model or the time
// limit: scored as misses. The others say nothing about quality.
const SCORED_FAILURES: ReadonlySet<ParseFailureCategory> = new Set([
  "timeout",
  "refusal",
  "context_window",
  "invalid_output",
]);

const normalize = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, " ");

function tagSet(tags: string[]) {
  return new Set(tags.map(normalize).filter((tag) => tag !== ""));
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 && b.size === 0) return 1;
  const shared = [...a].filter((tag) => b.has(tag)).length;
  return shared / (a.size + b.size - shared);
}

export function matchField(
  name: ParsedFieldName,
  label: Label,
  fields: ParsedFields,
): boolean {
  if (name === "stack") {
    const actual = tagSet(fields.stack.split(","));
    return jaccard(tagSet(label.stack), actual) >= MIN_JACCARD;
  }
  const expected = label[name];
  const actual = fields[name];
  // An empty form field is the parsed null.
  if (expected === null || actual === "") {
    return expected === null && actual === "";
  }
  return typeof expected === "number"
    ? Number(actual) === expected
    : normalize(actual) === normalize(expected);
}

function fieldScores(
  test: (name: ParsedFieldName) => boolean,
): Record<ParsedFieldName, boolean> {
  return {
    company: test("company"),
    role: test("role"),
    location: test("location"),
    level: test("level"),
    stack: test("stack"),
    salaryMin: test("salaryMin"),
    salaryMax: test("salaryMax"),
    salaryCurrency: test("salaryCurrency"),
  };
}

export function scoreExample(label: Label, outcome: Outcome): Score {
  if (outcome.kind === "failed" && !SCORED_FAILURES.has(outcome.category)) {
    return { kind: "unscored", category: outcome.category };
  }
  // Null when the request failed or says the text isn't a posting: all 8
  // fields are misses then, also where null is expected.
  const filled =
    outcome.kind === "parsed" && outcome.isJobPosting ? outcome.fields : null;
  return {
    kind: "scored",
    flag:
      outcome.kind === "parsed" && outcome.isJobPosting === label.isJobPosting,
    fields: label.isJobPosting
      ? fieldScores(
          (name) => filled !== null && matchField(name, label, filled),
        )
      : null,
  };
}

export function accuracyOf(scores: Score[]): RunAccuracy {
  const flag: Accuracy = { hits: 0, total: 0 };
  const fields: RunAccuracy["fields"] = {
    company: { hits: 0, total: 0 },
    role: { hits: 0, total: 0 },
    location: { hits: 0, total: 0 },
    level: { hits: 0, total: 0 },
    stack: { hits: 0, total: 0 },
    salaryMin: { hits: 0, total: 0 },
    salaryMax: { hits: 0, total: 0 },
    salaryCurrency: { hits: 0, total: 0 },
  };
  for (const score of scores) {
    if (score.kind === "unscored") continue;
    flag.total += 1;
    if (score.flag) flag.hits += 1;
    if (score.fields === null) continue;
    for (const name of PARSED_FIELD_NAMES) {
      fields[name].total += 1;
      if (score.fields[name]) fields[name].hits += 1;
    }
  }
  return { fields, flag };
}

// null when nothing was scored.
export function ratio({ hits, total }: Accuracy): number | null {
  return total === 0 ? null : hits / total;
}

// Pooled over the runs. It is compared with targets only for a complete set,
// where every run has the same total, so it equals the mean of the runs, and
// one division keeps the boundary exact.
export function meanAccuracy(runs: Accuracy[]): Accuracy {
  return {
    hits: runs.reduce((sum, run) => sum + run.hits, 0),
    total: runs.reduce((sum, run) => sum + run.total, 0),
  };
}

export function meetsTarget(
  name: ParsedFieldName,
  accuracy: Accuracy,
): boolean {
  const value = ratio(accuracy);
  return value !== null && value >= TARGETS[name];
}
