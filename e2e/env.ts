import { readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

// The only place that names the e2e env file. Values from the file override the
// shell, so the dev .env (or an exported DATABASE_URL) can never be used.
const ENV_FILE = path.resolve(__dirname, "..", ".env.test");
const REQUIRED_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
] as const;

export const E2E_DATABASE = "job_tracker_e2e";
export const E2E_PORT = 3100;
export const BASE_URL = `http://localhost:${E2E_PORT}`;

export function loadE2eEnv() {
  let contents: string;
  try {
    contents = readFileSync(ENV_FILE, "utf8");
  } catch {
    throw new Error(`e2e: missing ${ENV_FILE}; refusing to run`);
  }

  const fileEnv = parseEnv(contents);
  for (const key of REQUIRED_KEYS) {
    const value = fileEnv[key];
    if (!value) throw new Error(`e2e: ${key} is not set in ${ENV_FILE}`);
    process.env[key] = value;
  }

  const databaseName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
  if (databaseName !== E2E_DATABASE) {
    throw new Error(
      `e2e: database is "${databaseName}", expected "${E2E_DATABASE}"; refusing to run`,
    );
  }

  // Must match baseURL, or the origin checks for Server Actions and Better Auth fail.
  if (process.env.BETTER_AUTH_URL !== BASE_URL) {
    throw new Error(`e2e: BETTER_AUTH_URL must be ${BASE_URL}`);
  }

  // Set after the guard: the Prisma CLI reads this first, so a value from the
  // shell or the dev .env must never reach e2e or db test migrations.
  process.env.DATABASE_URL_UNPOOLED = process.env.DATABASE_URL;

  return Object.fromEntries(
    REQUIRED_KEYS.map((key) => [key, process.env[key]!]),
  ) as Record<(typeof REQUIRED_KEYS)[number], string>;
}
