import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// Prisma 7 does not load .env automatically; use Node's built-in loader.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // The CLI (migrate, db execute) needs Neon's direct URL; the app keeps the
  // pooled DATABASE_URL. `||`: an empty value falls back too (env() throws on it).
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED || env("DATABASE_URL"),
  },
});
