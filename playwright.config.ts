import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, E2E_PORT, loadE2eEnv } from "./e2e/env";

// Runs before the webServer and every test: refuses to start unless the env
// file points at the e2e database.
const e2eEnv = loadE2eEnv();

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
  // Production build: tests the PPR shell, the soft 404 and Secure cookies.
  // Migrations run here because the webServer starts before globalSetup.
  webServer: {
    command: `npx prisma migrate deploy && npm run build && npm run start -- -p ${E2E_PORT}`,
    url: `${BASE_URL}/sign-in`,
    // Never reuse a server that may run with the dev env.
    reuseExistingServer: false,
    timeout: 180_000,
    env: e2eEnv,
  },
});
