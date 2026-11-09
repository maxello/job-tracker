// PostToolUse hook (Edit|Write): runs Prettier --write on the edited file, then
// ESLint (no --fix) on it. ESLint errors go back to Claude via decision "block"
// (the edit is already done; Claude sees the reason next to the tool result).
// Formatting and tool failures never block.

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

// Extensions eslint-config-next lints; skip ESLint startup for anything else.
const LINTABLE = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { tool_input: args = {}, cwd } = JSON.parse(input);

// Canonical on-disk spelling: fixes d:\ vs D:\ and backslash/slash differences.
const canonical = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

const root = canonical(process.env.CLAUDE_PROJECT_DIR || cwd || "");
const file = args.file_path ? canonical(String(args.file_path)) : null;
if (!root || !file) process.exit(0);

// Only files inside the project, never node_modules.
const rel = path.relative(root, file);
const outside =
  !rel ||
  rel === ".." ||
  rel.startsWith(`..${path.sep}`) ||
  path.isAbsolute(rel);
if (outside || rel.split(path.sep).includes("node_modules")) process.exit(0);

// Local binaries via the current Node: no npx, no .cmd shims, no shell.
const run = (bin, argv) =>
  spawnSync(process.execPath, [path.join(root, "node_modules", bin), ...argv], {
    cwd: root,
    encoding: "utf8",
  });

// --ignore-unknown skips file types Prettier can't parse; .prettierignore applies.
// The result is ignored: formatting must never block.
run("prettier/bin/prettier.cjs", [
  "--write",
  "--ignore-unknown",
  "--log-level",
  "silent",
  file,
]);

if (!LINTABLE.has(path.extname(file).toLowerCase())) process.exit(0);

// --quiet: errors only. --no-warn-ignored: no noise for ignored files.
const lint = run("eslint/bin/eslint.js", [
  "--quiet",
  "--no-warn-ignored",
  "--format",
  "stylish",
  file,
]);

if (lint.status === 1 && lint.stdout.trim()) {
  console.log(
    JSON.stringify({
      decision: "block",
      reason: `ESLint errors in ${rel}. Fix them:\n${lint.stdout.trim()}`,
    }),
  );
} else if (lint.status !== 0) {
  // ESLint crashed or isn't installed: report to the user, don't send Claude chasing it.
  console.error(
    `format-lint: eslint failed (exit ${lint.status}): ${lint.stderr || lint.error?.message || ""}`,
  );
  process.exit(1);
}
