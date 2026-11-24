import {
  PARSED_FIELD_NAMES,
  type ParsedFieldName,
  type ParsedFields,
} from "@/features/job-parsing/schemas";
import type { Example } from "./examples";
import type { EvalResult, ExampleResult } from "./run";
import {
  accuracyOf,
  meanAccuracy,
  meetsTarget,
  ratio,
  TARGETS,
  type Accuracy,
} from "./scoring";
import { costOf, PRICES_CHECKED, type Usage } from "./usage";

// The terminal report. It prints expected and actual field values, never the
// posting text (SPEC.md US-7).

const NAME_WIDTH = 16;
const CELL_WIDTH = 30;

function percent(accuracy: Accuracy) {
  const value = ratio(accuracy);
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

const cell = (accuracy: Accuracy) =>
  `${accuracy.hits}/${accuracy.total} ${percent(accuracy)}`;

// A form value in the label's terms: null when empty, numbers, a tag list.
function actualValue(name: ParsedFieldName, fields: ParsedFields) {
  const value = fields[name];
  if (name === "stack") return value === "" ? [] : value.split(", ");
  if (value === "") return null;
  return name === "salaryMin" || name === "salaryMax" ? Number(value) : value;
}

function mismatches(
  { example, outcome, score }: ExampleResult,
  run: number,
): string[] {
  if (score.kind === "unscored") return [];
  const start = `${example.name}, run ${run}`;
  if (outcome.kind === "failed") {
    return [`${start}: failed (${outcome.category})`];
  }
  if (!score.flag) {
    return [
      `${start}, isJobPosting: expected ${example.label.isJobPosting}, actual ${outcome.isJobPosting}`,
    ];
  }
  const { fields } = score;
  if (fields === null) return [];
  return PARSED_FIELD_NAMES.filter((name) => !fields[name]).map((name) => {
    const expected = JSON.stringify(example.label[name]);
    const actual = JSON.stringify(actualValue(name, outcome.fields));
    return `${start}, ${name}: expected ${expected}, actual ${actual}`;
  });
}

function usageText(model: string, usage: Usage) {
  const bound = usage.unknown > 0 ? "≥ " : "";
  const parts = [`${bound}${usage.input} in`, `${bound}${usage.output} out`];
  const cost = costOf(model, usage);
  if (cost !== null) parts.push(`${bound}$${cost.toFixed(4)}`);
  const unknown = usage.unknown > 0 ? ` (unknown usage: ${usage.unknown})` : "";
  return parts.join(", ") + unknown;
}

export function reportLines({
  model,
  examples,
  partial,
  result,
}: {
  model: string;
  examples: Example[];
  partial: string[];
  result: EvalResult;
}): string[] {
  const { runs, complete } = result;
  const postings = examples.filter((e) => e.label.isJobPosting).length;
  const injected = examples.filter((e) => e.label.injection).length;
  const lines = [
    `Model: ${model}`,
    `Loaded: ${postings} postings (${injected} injected), ${examples.length - postings} negatives`,
    ...partial.map((reason) => `Partial set: ${reason}`),
  ];
  if (!complete) lines.push("Incomplete: some requests were not scored");

  const marks = [
    ...(partial.length > 0 ? ["partial"] : []),
    ...(complete ? [] : ["incomplete"]),
  ];
  const mark = marks.length > 0 ? ` (${marks.join(", ")})` : "";
  // The mean and the targets are only for a full set with every request scored.
  const comparable = marks.length === 0;

  const row = (name: string, cells: string[], end: string) =>
    (
      name.padEnd(NAME_WIDTH) +
      cells.map((text) => text.padEnd(CELL_WIDTH)).join("") +
      end
    ).trimEnd();

  const accuracies = runs.map((run) =>
    accuracyOf(run.results.map((item) => item.score)),
  );

  lines.push("");
  lines.push(
    row(
      "",
      runs.map((_, i) => `run ${i + 1}${mark}`),
      "",
    ),
  );
  for (const name of PARSED_FIELD_NAMES) {
    const cells = accuracies.map((accuracy) => accuracy.fields[name]);
    const mean = meanAccuracy(cells);
    const target = Math.round(TARGETS[name] * 100);
    const verdict = meetsTarget(name, mean) ? "PASS" : "MISS";
    lines.push(
      row(
        name,
        cells.map(cell),
        comparable
          ? `mean ${percent(mean)}  target ${target}%  ${verdict}`
          : "",
      ),
    );
  }
  const flags = accuracies.map((accuracy) => accuracy.flag);
  lines.push(
    row(
      "isJobPosting",
      flags.map(cell),
      comparable ? `mean ${percent(meanAccuracy(flags))}` : "",
    ),
  );

  const timeouts = runs.map((run, i) => {
    const count = run.results.filter(
      ({ outcome }) =>
        outcome.kind === "failed" && outcome.category === "timeout",
    ).length;
    return `run ${i + 1}: ${count}`;
  });
  lines.push("", `Timeouts: ${timeouts.join(", ")}`);

  const missed = runs.flatMap((run, i) =>
    run.results.flatMap((item) => mismatches(item, i + 1)),
  );
  if (missed.length > 0) lines.push("", "Mismatches:", ...missed);

  const errors = runs.flatMap((run, i) =>
    run.results.flatMap(({ example, score }) =>
      score.kind === "unscored"
        ? [`Not scored: ${example.name}, run ${i + 1}: ${score.category}`]
        : [],
    ),
  );
  if (errors.length > 0) lines.push("", ...errors);

  const total = runs.reduce<Usage>(
    (sum, { usage }) => ({
      input: sum.input + usage.input,
      output: sum.output + usage.output,
      unknown: sum.unknown + usage.unknown,
    }),
    { input: 0, output: 0, unknown: 0 },
  );
  const checked =
    costOf(model, total) === null ? "" : ` (prices checked ${PRICES_CHECKED})`;
  lines.push(
    "",
    ...runs.map((run, i) => `Run ${i + 1}: ${usageText(model, run.usage)}`),
    `Total: ${usageText(model, total)}${checked}`,
  );
  return lines;
}
