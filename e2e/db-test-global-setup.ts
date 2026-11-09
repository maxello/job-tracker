import { execSync } from "node:child_process";
import { loadE2eEnv } from "./env";

// Vitest global setup for `npm run test:db`: applies migrations to the e2e
// database. No truncate: each test creates its own user and data.
export default function globalSetup() {
  loadE2eEnv();
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
