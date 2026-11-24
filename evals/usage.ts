import { z } from "zod";

// `unknown` counts the attempts whose usage couldn't be read.
export type Usage = { input: number; output: number; unknown: number };

// USD per million tokens. Text is capped at 20,000 characters and nothing is
// cached, so these two prices are the whole cost.
export const PRICES_CHECKED = "2026-11-23";

const PRICES: Record<string, { input: number; output: number } | undefined> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

const bodySchema = z.object({
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

// Wraps globalThis.fetch: requestParse doesn't return usage, and its SDK
// client takes the global fetch when it is created, once per request, so every
// attempt is seen, the retry included. settle() waits for the bodies read so
// far and returns the usage since the last settle().
export function watchUsage(): {
  settle: () => Promise<Usage>;
  restore: () => void;
} {
  const original = globalThis.fetch;
  let usage: Usage = { input: 0, output: 0, unknown: 0 };
  let pending: Promise<void>[] = [];

  async function read(response: Response) {
    try {
      const body = bodySchema.parse(await response.json());
      usage.input += body.usage.input_tokens;
      usage.output += body.usage.output_tokens;
    } catch {
      usage.unknown += 1;
    }
  }

  globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
    let response: Response;
    try {
      response = await original(...args);
    } catch (error) {
      usage.unknown += 1;
      throw error;
    }
    // Read beside the caller, not before it: the request's timing is the
    // app's. HTTP error responses have no usage to miss.
    if (response.ok) pending.push(read(response.clone()));
    return response;
  };

  return {
    settle: async () => {
      await Promise.all(pending);
      const settled = usage;
      pending = [];
      usage = { input: 0, output: 0, unknown: 0 };
      return settled;
    },
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

// USD, or null for a model without a price.
export function costOf(model: string, usage: Usage): number | null {
  const price = PRICES[model];
  if (price === undefined) return null;
  return (usage.input * price.input + usage.output * price.output) / 1_000_000;
}
