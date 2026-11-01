import { z } from "zod";

// Inputs arrive as FormData strings. Text is trimmed; empty or whitespace-only
// optional values become undefined.
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const requiredText = (max: number) =>
  z.string().trim().min(1, "Required").max(max);

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max).optional());

const optionalSalary = z.preprocess(
  emptyToUndefined,
  z.coerce
    .number()
    .int("Must be a whole number")
    .nonnegative("Must be 0 or more")
    .optional(),
);

// Accepts a comma-separated string ("React, Node") or an array of tags.
const stack = z.preprocess(
  (value) => {
    const items = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(",")
        : [];
    return items
      .map((item) => (typeof item === "string" ? item.trim() : item))
      .filter((item) => item !== "");
  },
  z
    .array(z.string().max(50, "Each tag must be 50 characters or fewer"))
    .max(30, "Up to 30 tags"),
);

export const createApplicationSchema = z
  .object({
    company: requiredText(200),
    role: requiredText(200),
    url: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(2048)
        .pipe(
          z.url({
            protocol: /^https?$/,
            error: "Must be an http or https URL",
          }),
        )
        .optional(),
    ),
    notes: optionalText(5000),
    location: optionalText(200),
    level: optionalText(100),
    stack,
    salaryMin: optionalSalary,
    salaryMax: optionalSalary,
    salaryCurrency: z.preprocess(
      (value) =>
        typeof value === "string"
          ? emptyToUndefined(value.trim().toUpperCase())
          : value,
      z
        .string()
        .regex(/^[A-Z]{3}$/, "Must be a 3-letter ISO 4217 code, e.g. USD")
        .optional(),
    ),
  })
  .superRefine((data, ctx) => {
    if (
      data.salaryMin !== undefined &&
      data.salaryMax !== undefined &&
      data.salaryMin > data.salaryMax
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["salaryMax"],
        message: "Must be greater than or equal to the minimum",
      });
    }
    if (
      (data.salaryMin !== undefined || data.salaryMax !== undefined) &&
      data.salaryCurrency === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["salaryCurrency"],
        message: "Required when a salary is set",
      });
    }
  });

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
