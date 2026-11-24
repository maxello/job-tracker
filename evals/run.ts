import type { ParseResult } from "@/features/job-parsing/client";
import { toParsedFields } from "@/features/job-parsing/parsed-fields";
import type { Example } from "./examples";
import { scoreExample, type Outcome, type Score } from "./scoring";
import type { Usage } from "./usage";

const RUNS = 3;

// The app's budget for one parse request. Duplicated: it is private to
// src/features/job-parsing/actions.ts.
const BUDGET_MS = 30_000;

// The SDK also reports a connect timeout as a timeout, long before the budget
// ends. The margin is for the deadline, the signal and the SDK's own timer,
// which can end a few ms apart.
const TIMEOUT_MIN_MS = BUDGET_MS - 1_000;

export type ParseFn = (
  text: string,
  options: { signal: AbortSignal; deadline: number },
) => Promise<ParseResult>;

export type ExampleResult = {
  example: Example;
  outcome: Outcome;
  score: Score;
};

export type Run = { results: ExampleResult[]; usage: Usage };

export type EvalResult = { runs: Run[]; complete: boolean };

async function outcomeOf(text: string, parse: ParseFn): Promise<Outcome> {
  const start = Date.now();
  try {
    const result = await parse(text, {
      signal: AbortSignal.timeout(BUDGET_MS),
      deadline: start + BUDGET_MS,
    });
    if (!result.ok) {
      const early = Date.now() - start < TIMEOUT_MIN_MS;
      return {
        kind: "failed",
        category:
          result.category === "timeout" && early
            ? "api_connection"
            : result.category,
      };
    }
    return {
      kind: "parsed",
      isJobPosting: result.output.isJobPosting,
      // After the per-field validation: what the user would see.
      fields: toParsedFields(result.output),
    };
  } catch {
    return { kind: "failed", category: "unexpected" };
  }
}

export async function runEval({
  examples,
  parse,
  settle,
}: {
  examples: Example[];
  parse: ParseFn;
  settle: () => Promise<Usage>;
}): Promise<EvalResult> {
  const runs: Run[] = [];
  let complete = true;
  for (let i = 0; i < RUNS; i++) {
    const run: Run = {
      results: [],
      usage: { input: 0, output: 0, unknown: 0 },
    };
    for (const example of examples) {
      const outcome = await outcomeOf(example.text, parse);
      const score = scoreExample(example.label, outcome);
      if (score.kind === "unscored") complete = false;
      run.results.push({ example, outcome, score });

      const usage = await settle();
      run.usage.input += usage.input;
      run.usage.output += usage.output;
      run.usage.unknown += usage.unknown;
    }
    runs.push(run);
  }
  return { runs, complete };
}
