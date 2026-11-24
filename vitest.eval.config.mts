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
    // Worst case 18 examples x 3 runs x 30 s = 27 min, plus a margin.
    testTimeout: 35 * 60_000,
  },
});
