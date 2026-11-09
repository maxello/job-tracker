import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Real-database checks (`npm run test:db`) against job_tracker_e2e. Not part of
// `npm test`; never run alongside `npm run e2e`, whose setup truncates tables.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    fileParallelism: false,
    // Applies migrations; refuses to run unless the env points at the e2e database.
    globalSetup: ["./e2e/db-test-global-setup.ts"],
    // Loads the e2e env in each worker before `@/lib/db` reads DATABASE_URL.
    setupFiles: ["./e2e/db-test-env.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
