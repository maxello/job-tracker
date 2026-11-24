import { fileURLToPath } from "node:url";
import { it } from "vitest";
import { runCommand } from "./command";

// `npm run eval`: calls the real, paid API. Not part of `npm test`.
it("parsing quality (US-7)", async () => {
  const { ok } = await runCommand({
    // Variables already set in the shell win.
    loadEnv: () => process.loadEnvFile(".env"),
    dataDir: fileURLToPath(new URL("./data", import.meta.url)),
    print: (line) => console.log(line),
  });
  if (!ok) throw new Error("The eval failed: see the output above");
});
