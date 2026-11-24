import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The parsing eval (`npm run eval`): real, paid API calls. Not part of
// `npm test`.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    // The report prints as is, without a "stdout |" header per line.
    disableConsoleIntercept: true,
    // Worst case for a full set: 18 examples x 3 runs x 30 s = 27 min. 60 min
    // also covers a partial set of up to 39 examples, with a margin: the report
    // prints at the end, so a timeout would lose it.
    testTimeout: 60 * 60_000,
  },
});
