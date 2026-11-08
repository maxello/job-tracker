import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Playwright specs run with `npm run e2e`, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
