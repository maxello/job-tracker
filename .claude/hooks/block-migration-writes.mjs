// PreToolUse hook (Edit|Write|NotebookEdit): denies writes inside
// prisma/migrations/, both existing and new files. Migrations are append-only:
// Claude must create a new one with `npx prisma migrate dev` instead.
// Reads are not matched. Shell commands (Bash/PowerShell) are not checked, so
// this is a guard, not a sandbox. A path that can't be resolved is denied
// (fail closed): we can't prove the write lands outside prisma/migrations/.

import { realpathSync } from "node:fs";
import path from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const { tool_input: args = {}, cwd } = JSON.parse(input);

const deny = (reason) => {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
};

// Canonical on-disk spelling: fixes d:\ vs D:\ and backslash/slash differences.
const canonical = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

// Win32 drops trailing dots and spaces from each name, so `migrations.\x.sql`
// writes into `migrations\`. realpath doesn't normalize these; do it here.
const win32Names = (p) =>
  process.platform === "win32"
    ? p
        .split(path.sep)
        .map((s) => s.replace(/[. ]+$/, "") || s)
        .join(path.sep)
    : p;

// Like canonical(), but also works for files that don't exist yet: the deepest
// existing ancestor is canonicalized and the missing tail is appended.
// path.resolve() first makes the path absolute and collapses `..` lexically.
const canonicalTarget = (p) => {
  let head = win32Names(path.resolve(cwd || "", p));
  const tail = [];
  for (;;) {
    const real = canonical(head);
    if (real) return path.join(real, ...tail);
    const parent = path.dirname(head);
    if (parent === head) return null;
    tail.unshift(path.basename(head));
    head = parent;
  }
};

// NTFS is case-insensitive; a not-yet-existing tail keeps the caller's casing.
const key = (p) => (process.platform === "win32" ? p.toLowerCase() : p);

const target = args.file_path ?? args.notebook_path;
if (typeof target !== "string" || !target) process.exit(0);

const root = canonical(process.env.CLAUDE_PROJECT_DIR || cwd || "");
const file = canonicalTarget(target);
const migrations =
  root && canonicalTarget(path.join(root, "prisma", "migrations"));
if (!file || !migrations) {
  deny(
    `Blocked: could not resolve "${target}" to check it against prisma/migrations/. ` +
      "Retry with an absolute path inside the project.",
  );
}

const rel = path.relative(key(migrations), key(file));
const outside =
  rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);

if (!outside) {
  deny(
    `Blocked: ${path.relative(root, file)} is inside prisma/migrations/. ` +
      "Migrations are append-only: an applied migration must never change, or " +
      "databases that already ran it drift from the migration history. " +
      "Don't edit or add files there by hand. Change prisma/schema.prisma, then " +
      "create a new migration with `npx prisma migrate dev --name <change>`. " +
      "If migrate dev reports drift or asks to reset the database, stop and ask the user. " +
      "If an existing migration really must change, stop and ask the user.",
  );
}
