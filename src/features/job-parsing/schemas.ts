import { z } from "zod";
import type { ApplicationFormValues } from "@/features/applications/form-values";

// The pasted posting (US-7): trimmed, then counted like the US-1 fields.
// A missing field reads as empty.
export const parseInputSchema = z.object({
  text: z.preprocess(
    (value) => value ?? "",
    z
      .string()
      .trim()
      .min(1, "Paste the text of a job posting")
      .max(20_000, "The text is too long (max 20,000 characters)"),
  ),
});

// The structured output the model must return (US-7). Loose on purpose: the
// real limits are the US-1 field schemas applied in parsed-fields.ts.
export const modelOutputSchema = z.object({
  isJobPosting: z.boolean(),
  company: z.string().nullable(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  level: z.string().nullable(),
  stack: z.array(z.string()),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string().nullable(),
});

export type ModelOutput = z.infer<typeof modelOutputSchema>;

export const PARSED_FIELD_NAMES = [
  "company",
  "role",
  "location",
  "level",
  "stack",
  "salaryMin",
  "salaryMax",
  "salaryCurrency",
] as const;

export type ParsedFieldName = (typeof PARSED_FIELD_NAMES)[number];

// The parsed fields as the form's text values ("" when empty).
export type ParsedFields = Pick<ApplicationFormValues, ParsedFieldName>;
