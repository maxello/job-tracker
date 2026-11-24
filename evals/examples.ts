import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { toParsedFields } from "@/features/job-parsing/parsed-fields";
import {
  modelOutputSchema,
  PARSED_FIELD_NAMES,
  parseInputSchema,
} from "@/features/job-parsing/schemas";

// The eval data: <name>.txt (the posting) and <name>.json (the label). Errors
// name the file and the field, never a value or the posting text.

const labelSchema = z.strictObject({
  ...modelOutputSchema.shape,
  injection: z.literal(true).optional(),
});

export type Label = z.infer<typeof labelSchema>;

export type Example = { name: string; text: string; label: Label };

export type LoadResult =
  { ok: true; examples: Example[] } | { ok: false; errors: string[] };

const POSTINGS = { min: 12, max: 15 };
const NEGATIVES = { min: 2, max: 3 };

// The label as the form values the app's validation must leave unchanged.
function changedFields(label: Label): string[] {
  const parsed = toParsedFields(label);
  return PARSED_FIELD_NAMES.filter((name) => {
    if (name === "stack") {
      const kept = parsed.stack === "" ? [] : parsed.stack.split(", ");
      return JSON.stringify(kept) !== JSON.stringify(label.stack);
    }
    const value = label[name];
    // A text field is null, never "".
    return value === "" || parsed[name] !== (value ?? "").toString();
  });
}

function labelErrors(label: Label): string[] {
  const errors = changedFields(label).map(
    (name) => `${name}: the app's validation would change it`,
  );
  if (!label.isJobPosting) {
    if (label.injection) errors.push("injection: only on a job posting");
    for (const name of PARSED_FIELD_NAMES) {
      const empty =
        name === "stack" ? label.stack.length === 0 : label[name] === null;
      if (!empty) errors.push(`${name}: must be empty, not a job posting`);
    }
  }
  return errors;
}

function parseLabel(
  source: string,
): { ok: true; label: Label } | { ok: false; errors: string[] } {
  let json: unknown;
  try {
    // Windows editors can add a BOM, which JSON.parse rejects.
    json = JSON.parse(source.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, errors: ["not valid JSON"] };
  }
  const result = labelSchema.safeParse(json);
  if (!result.success) {
    // Only the code and the path: messages can name values and unknown keys.
    const errors = result.error.issues.map((issue) =>
      [...issue.path, issue.code].join(": "),
    );
    return { ok: false, errors };
  }
  const errors = labelErrors(result.data);
  return errors.length > 0
    ? { ok: false, errors }
    : { ok: true, label: result.data };
}

export function loadExamples(dir: string): LoadResult {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return { ok: false, errors: ["The data directory can't be read"] };
  }
  const withExtension = (extension: string) =>
    new Set(
      files
        .filter((file) => file.endsWith(extension))
        .map((file) => file.slice(0, -extension.length)),
    );
  const texts = withExtension(".txt");
  const labels = withExtension(".json");
  const names = [...new Set([...texts, ...labels])].sort();
  if (names.length === 0) return { ok: false, errors: ["The set is empty"] };

  const examples: Example[] = [];
  const errors: string[] = [];
  for (const name of names) {
    if (!labels.has(name)) {
      errors.push(`${name}.txt: no ${name}.json`);
      continue;
    }
    if (!texts.has(name)) {
      errors.push(`${name}.json: no ${name}.txt`);
      continue;
    }
    const input = parseInputSchema.safeParse({
      text: readFileSync(join(dir, `${name}.txt`), "utf8"),
    });
    if (!input.success) {
      errors.push(`${name}.txt: empty or over 20,000 characters`);
    }
    const label = parseLabel(readFileSync(join(dir, `${name}.json`), "utf8"));
    if (!label.ok) {
      errors.push(...label.errors.map((error) => `${name}.json: ${error}`));
    }
    if (input.success && label.ok) {
      examples.push({ name, text: input.data.text, label: label.label });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, examples };
}

// Why a set is partial (no mean, no targets); empty when it isn't.
export function partialReasons(examples: Example[]): string[] {
  const postings = examples.filter((e) => e.label.isJobPosting).length;
  const negatives = examples.length - postings;
  const injected = examples.filter((e) => e.label.injection).length;
  const reasons: string[] = [];
  if (postings < POSTINGS.min || postings > POSTINGS.max) {
    reasons.push(
      `${postings} postings, expected ${POSTINGS.min}-${POSTINGS.max}`,
    );
  }
  if (negatives < NEGATIVES.min || negatives > NEGATIVES.max) {
    reasons.push(
      `${negatives} negatives, expected ${NEGATIVES.min}-${NEGATIVES.max}`,
    );
  }
  if (injected !== 1) {
    reasons.push(`${injected} injected postings, expected 1`);
  }
  return reasons;
}
