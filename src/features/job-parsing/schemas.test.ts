import { describe, expect, it } from "vitest";
import { parseInputSchema } from "./schemas";

const EMPTY = "Paste the text of a job posting";
const TOO_LONG = "The text is too long (max 20,000 characters)";

function textErrors(text: unknown) {
  const result = parseInputSchema.safeParse({ text });
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}

describe("parseInputSchema (US-7)", () => {
  it.each(["", "  \n "])("rejects empty or whitespace-only text %j", (text) => {
    expect(textErrors(text)).toEqual([EMPTY]);
  });

  it("reads a missing text field (null from FormData) as empty", () => {
    expect(textErrors(null)).toEqual([EMPTY]);
  });

  it("accepts 20,000 characters", () => {
    const result = parseInputSchema.safeParse({ text: "a".repeat(20_000) });
    expect(result.success).toBe(true);
  });

  it("trims before counting: 20,000 characters padded with spaces pass", () => {
    const result = parseInputSchema.safeParse({
      text: `   ${"a".repeat(20_000)}  \n`,
    });
    expect(result.success && result.data.text).toBe("a".repeat(20_000));
  });

  it("rejects 20,001 characters", () => {
    expect(textErrors("a".repeat(20_001))).toEqual([TOO_LONG]);
  });
});
