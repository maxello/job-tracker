import { z } from "zod";
import { hasNoNul, NUL_MESSAGE } from "@/lib/validation";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email")
  .max(254, "Must be 254 characters or fewer")
  .pipe(z.email("Enter a valid email address"));

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter your name")
    .max(100, "Must be 100 characters or fewer")
    .refine(hasNoNul, NUL_MESSAGE),
  email,
  // Not trimmed: spaces are valid password characters.
  password: z
    .string()
    .min(
      PASSWORD_MIN_LENGTH,
      `Must be at least ${PASSWORD_MIN_LENGTH} characters`,
    )
    .max(
      PASSWORD_MAX_LENGTH,
      `Must be ${PASSWORD_MAX_LENGTH} characters or fewer`,
    ),
});

// No length rule on the password: a failed sign-in gets the shared credentials
// error, not a hint about the password policy.
export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});
