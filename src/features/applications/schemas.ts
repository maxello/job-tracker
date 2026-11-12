import { z } from "zod";
import { Status } from "@/generated/prisma/enums";
import { hasNoNul, NUL_MESSAGE } from "@/lib/validation";

// Inputs arrive as FormData strings. Text is trimmed; empty or whitespace-only
// optional values become undefined.
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max)
    .refine(hasNoNul, NUL_MESSAGE);

const optionalText = (max: number) =>
  z.preprocess(
    emptyToUndefined,
    z.string().trim().max(max).refine(hasNoNul, NUL_MESSAGE).optional(),
  );

// The largest value of the Postgres INTEGER column.
const MAX_SALARY = 2_147_483_647;

// Digits only: Number() alone would also accept "1e9" and "0x10".
const optionalSalary = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, "Must be a whole number")
    .transform(Number)
    .pipe(
      z
        .number()
        .nonnegative("Must be 0 or more")
        .max(MAX_SALARY, `Must be ${MAX_SALARY} or less`),
    )
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
    .array(
      z
        .string()
        .max(50, "Each tag must be 50 characters or fewer")
        .refine(hasNoNul, NUL_MESSAGE),
    )
    .max(30, "Up to 30 tags"),
);

export const createApplicationSchema = z
  .object({
    company: requiredText("Company", 200),
    role: requiredText("Role", 200),
    url: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(2048)
        .refine(hasNoNul, NUL_MESSAGE)
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
        message: "Currency is required when a salary is set",
      });
    }
  });

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

// The id is not checked for format: the ownership query decides, so any unknown
// id gets the not-found response like a missing one. Only an id the database
// can't accept is rejected here, and it gets the same response.
export const applicationIdSchema = z.string().min(1).refine(hasNoNul);

// Only values of the Prisma Status enum are accepted.
export const changeStatusSchema = z.object({
  id: applicationIdSchema,
  status: z.enum(Status),
});
