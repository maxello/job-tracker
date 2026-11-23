import type { z } from "zod";
import { createApplicationSchema } from "@/features/applications/schemas";
import type { ModelOutput, ParsedFields } from "./schemas";

// Each parsed field is validated on its own with its US-1 field schema, never
// the whole US-1 object, so one bad field doesn't discard the others; a field
// that fails is left empty (SPEC.md US-7, decision log 2026-11-23).
const field = createApplicationSchema.shape;

const MAX_TAGS = 30;

// The value the US-1 schema produces (trimmed, upper-cased, ...), or
// undefined when it fails or reads as empty.
function check(schema: z.ZodType, value: unknown): unknown {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

const asText = (value: unknown) => (typeof value === "string" ? value : "");

// The US-1 salary schema takes the form's digit string.
function salary(value: number | null): number | undefined {
  const checked = check(field.salaryMin, value === null ? "" : String(value));
  return typeof checked === "number" ? checked : undefined;
}

// A tag is checked as a one-tag stack, which trims it and drops it when empty.
// Tags with a comma are dropped too: the form joins tags with ", " and Save
// splits them on commas again.
function stackTag(tag: string): string[] {
  if (tag.includes(",")) return [];
  const checked = check(field.stack, [tag]);
  return Array.isArray(checked)
    ? checked.filter((t) => typeof t === "string")
    : [];
}

export function toParsedFields(output: ModelOutput): ParsedFields {
  let salaryMin = salary(output.salaryMin);
  let salaryMax = salary(output.salaryMax);
  if (
    salaryMin !== undefined &&
    salaryMax !== undefined &&
    salaryMin > salaryMax
  ) {
    salaryMin = undefined;
    salaryMax = undefined;
  }

  // Only after the salary rules: the currency needs a kept salary value.
  const hasSalary = salaryMin !== undefined || salaryMax !== undefined;
  const salaryCurrency = hasSalary
    ? asText(check(field.salaryCurrency, output.salaryCurrency ?? ""))
    : "";

  return {
    company: asText(check(field.company, output.company ?? "")),
    role: asText(check(field.role, output.role ?? "")),
    location: asText(check(field.location, output.location ?? "")),
    level: asText(check(field.level, output.level ?? "")),
    stack: output.stack.flatMap(stackTag).slice(0, MAX_TAGS).join(", "),
    salaryMin: salaryMin?.toString() ?? "",
    salaryMax: salaryMax?.toString() ?? "",
    salaryCurrency,
  };
}
