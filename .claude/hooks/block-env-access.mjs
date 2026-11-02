// PreToolUse hook: blocks access to .env files (CLAUDE.md: never read or edit
// them). .env.example is allowed. Exit code 2 blocks the tool call.
// Shell commands are matched by text, so this is a guard, not a sandbox.

let input = "";
for await (const chunk of process.stdin) input += chunk;

const { tool_name: tool, tool_input: args = {} } = JSON.parse(input);

const isEnvName = (name) =>
  /^\.env(\..+)?$/.test(name) && name !== ".env.example";

// `.env`, `.env.local`, `./.env`, `.env*` in a command; not `process.env`,
// `$env:VAR` or `.env.example`.
const ENV_IN_COMMAND = /(?:^|[^\w.])(\.env(?:\.[\w.-]+)?)(?![\w.-])/g;

function blocked() {
  if (tool === "Bash" || tool === "PowerShell") {
    const command = String(args.command ?? "");
    return [...command.matchAll(ENV_IN_COMMAND)].some(
      ([, name]) => name !== ".env.example",
    );
  }
  const path = String(args.file_path ?? args.path ?? "");
  const name = path.split(/[\\/]/).pop() ?? "";
  return isEnvName(name);
}

if (blocked()) {
  console.error(
    "Blocked: .env files must not be read or edited (CLAUDE.md). Use .env.example.",
  );
  process.exit(2);
}
