import { requestParse } from "@/features/job-parsing/client";
import { loadExamples, partialReasons } from "./examples";
import { reportLines } from "./report";
import { runEval, type EvalResult } from "./run";
import { watchUsage } from "./usage";

// The eval command (SPEC.md US-7). It writes no files. A missed target is ok;
// bad data or config, a partial set or an incomplete command isn't.

// A missing env file is fine: the shell may hold the variables. Any other
// error is hidden, because it could quote the file.
function loadEnvOrFail(loadEnv: () => void): boolean {
  try {
    loadEnv();
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
  }
}

export async function runCommand({
  loadEnv,
  dataDir,
  print,
}: {
  loadEnv: () => void;
  dataDir: string;
  print: (line: string) => void;
}): Promise<{ ok: boolean }> {
  if (!loadEnvOrFail(loadEnv)) {
    print("Couldn't load the env file");
    return { ok: false };
  }
  // A stub's replies must never look like a score.
  if (process.env.ANTHROPIC_BASE_URL?.trim()) {
    print("ANTHROPIC_BASE_URL is set: unset it to run the eval");
    return { ok: false };
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    print("ANTHROPIC_API_KEY is not set");
    return { ok: false };
  }
  const model = process.env.PARSE_MODEL;
  if (!model) {
    print("PARSE_MODEL is not set");
    return { ok: false };
  }
  // At the debug level the SDK logs request and response bodies.
  process.env.ANTHROPIC_LOG = "off";

  const loaded = loadExamples(dataDir);
  if (!loaded.ok) {
    print("Invalid eval data:");
    for (const error of loaded.errors) print(error);
    return { ok: false };
  }
  const { examples } = loaded;
  const partial = partialReasons(examples);

  const usage = watchUsage();
  let result: EvalResult;
  try {
    result = await runEval({
      examples,
      parse: requestParse,
      settle: usage.settle,
    });
  } finally {
    usage.restore();
  }

  for (const line of reportLines({ model, examples, partial, result })) {
    print(line);
  }
  return { ok: result.complete && partial.length === 0 };
}
