import { execSync } from "node:child_process";
import { loadE2eEnv } from "./env";

// Truncates every table in the e2e database. Users are re-created by the setup
// project through the sign-up form.
export default function globalSetup() {
  loadE2eEnv();
  execSync("npx prisma db execute --file e2e/reset.sql", {
    stdio: "inherit",
    env: process.env,
  });
}
