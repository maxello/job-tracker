// Stop hook: runs `npm run typecheck`, then `npm test` (unit tests only, not
// test:db or e2e), and blocks the turn from ending while either fails.
// Skipped when `git status --porcelain` is clean (turns without edits stay fast)
// and while the marker `.claude/stop-checks.off` exists (TDD red phase).
// Loop guard: at most MAX_BLOCKS consecutive blocks per session, counted in a
// temp file. Then the turn ends and the user is told the checks still fail.
// Claude Code's own cap (8 consecutive blocks, reset on every tool call) is
// only a backstop: it never trips while Claude keeps editing.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_BLOCKS = 3;
const HEAD = 2500; // chars kept from the start of a failing check's output
const TAIL = 500; // ...and from its end (summary lines)

let input = "";
for await (const chunk of process.stdin) input += chunk;
const {
  session_id: sessionId = "",
  stop_hook_active: active = false,
  cwd,
} = JSON.parse(input);

// Canonical on-disk spelling: fixes d:\ vs D:\ and backslash/slash differences.
const canonical = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

const root = canonical(process.env.CLAUDE_PROJECT_DIR || cwd || "");
if (!root) {
  console.error("stop-checks: could not resolve the project directory");
  process.exit(1);
}
// Vitest fails every file ("no tests") when started from d:\ instead of D:\.
process.chdir(root);

// Consecutive blocks in this session; reset when a new turn starts.
const stateFile = path.join(
  os.tmpdir(),
  `claude-stop-checks-${String(sessionId).replace(/[^\w-]/g, "_") || "default"}.json`,
);
const readBlocks = () => {
  try {
    return Number(JSON.parse(readFileSync(stateFile, "utf8")).blocks) || 0;
  } catch {
    return 0;
  }
};
const clearBlocks = () => rmSync(stateFile, { force: true });

// TDD red phase: tests are written and run red before review and before the
// implementation. While this (gitignored) marker exists, the hook is off.
if (existsSync(path.join(root, ".claude", "stop-checks.off"))) {
  clearBlocks();
  process.exit(0);
}

// Fixed command strings only; the shell is needed to run npm.cmd on Windows.
const run = (command) =>
  spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  });

// No changes in the working tree: nothing to check. If git itself fails, check anyway.
const git = run("git status --porcelain");
if (git.status === 0 && !git.stdout.trim()) {
  clearBlocks();
  process.exit(0);
}

const trim = (text) => {
  const out = text.replace(/\x1b\[[0-9;]*m/g, "").trim();
  return out.length <= HEAD + TAIL
    ? out
    : `${out.slice(0, HEAD)}\n…[trimmed]…\n${out.slice(-TAIL)}`;
};

const CHECKS = [
  ["typecheck", "npm run typecheck --silent"],
  ["unit tests", "npm test --silent"],
];

const failures = [];
for (const [name, command] of CHECKS) {
  const result = run(command);
  if (result.error) {
    // Couldn't start the check: tell the user, don't send Claude chasing it.
    console.error(
      `stop-checks: could not run ${command}: ${result.error.message}`,
    );
    process.exit(1);
  }
  if (result.status !== 0) {
    failures.push({
      name,
      output: `$ ${command}\n${trim(`${result.stdout}\n${result.stderr}`)}`,
    });
  }
}

if (failures.length === 0) {
  clearBlocks();
  process.exit(0);
}

const names = failures.map((f) => f.name).join(" and ");
const blocks = (active ? readBlocks() : 0) + 1;

if (blocks > MAX_BLOCKS) {
  clearBlocks();
  console.log(
    JSON.stringify({
      systemMessage:
        `stop-checks: ${names} still failing after ${MAX_BLOCKS} fix attempts; ` +
        "letting the turn end. Run `npm run typecheck && npm test` to see the errors.",
    }),
  );
  process.exit(0);
}

writeFileSync(stateFile, JSON.stringify({ blocks }));
console.log(
  JSON.stringify({
    decision: "block",
    reason:
      `Stop check ${blocks}/${MAX_BLOCKS}: ${names} failed. Fix the code so they pass. ` +
      "Do not edit, skip or delete existing tests to make them pass (CLAUDE.md); " +
      "if a test itself looks wrong, stop and ask the user.\n\n" +
      failures.map((f) => f.output).join("\n\n"),
  }),
);
