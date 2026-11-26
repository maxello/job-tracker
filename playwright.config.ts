import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_PORT, loadE2eEnv } from "./e2e/env";

// Runs before the webServer and every test: refuses to start unless the env
// file points at the e2e database.
const e2eEnv = loadE2eEnv();

// The port e2e/anthropic-stub.ts listens on.
const STUB_URL = "http://127.0.0.1:3101";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // One shared database: run serially until tests isolate their data.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    // A local Claude API stub (US-7): e2e never calls the real API.
    {
      command: "node e2e/anthropic-stub.ts",
      url: `${STUB_URL}/requests`,
      reuseExistingServer: false,
    },
    // Production build: tests the PPR shell, the soft 404 and Secure cookies.
    // Migrations run here because the webServer starts before globalSetup.
    {
      command: `npx prisma migrate deploy && npm run build && npm run start -- -p ${E2E_PORT}`,
      url: `${BASE_URL}/sign-in`,
      // Never reuse a server that may run with the dev env.
      reuseExistingServer: false,
      timeout: 180_000,
      // Set here, so they win over the shell and any env file: a real key
      // in the shell can't reach the real API.
      env: {
        ...e2eEnv,
        ANTHROPIC_BASE_URL: STUB_URL,
        ANTHROPIC_API_KEY: "e2e-stub-key",
        PARSE_MODEL: "e2e-stub-model",
        // Raises only the US-0 IP limits: every e2e request comes from one
        // socket address. Never set in production (SPEC.md section 9).
        E2E_AUTH_IP_LIMIT: "1000",
      },
    },
  ],
});
