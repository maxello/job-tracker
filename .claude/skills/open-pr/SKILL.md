---
name: open-pr
description: "Open a pull request for the current branch: run the checks, commit, push the branch and create the PR with gh. Never pushes to main or merges."
argument-hint: "[issue number, optional]"
disable-model-invocation: true
allowed-tools: Bash(git branch *) Bash(git status *) Bash(git log *) Bash(git diff *) Bash(git add *) Bash(git commit *) Bash(git push -u origin *) Bash(gh issue view *) Bash(gh pr view *) Bash(gh pr create *) Bash(gh pr comment *) Bash(npm run lint) Bash(npm run typecheck) Bash(cd D:/Projects/job-tracker && npm test) Bash(cd D:/Projects/job-tracker && npm run test:db) Bash(npm run e2e)
---

# Open a pull request for the current branch

Issue: $ARGUMENTS (may be empty)

## Current state

- Branch: !`git branch --show-current`
- Uncommitted: !`git status --short`
- Stop-checks marker (empty if absent): !`git status --short --ignored -- .claude/stop-checks.off`
- Commits not on main: !`git log --oneline main..HEAD`
- Changed files vs main: !`git diff --stat main...HEAD`
- Existing PR: !`gh pr view --json url,state || true`

Run the whole flow in one turn. Stop only on a failure or a question below; don't stop between steps for approval. Follow CLAUDE.md (Vitest drive note, Conventional Commits, no Co-Authored-By trailer).

Run every command with the Bash tool, never PowerShell: `allowed-tools` lists Bash commands only.

## 1. Guard

Stop and tell me if:

- the branch is `main` or empty (detached HEAD): ask me to create a branch;
- `.claude/stop-checks.off` exists (the marker line in Current state is not empty);
- there is nothing to ship (no uncommitted changes and no commits ahead of main).

## 2. Issue

If an issue number was given, run `gh issue view <number>` and compare it with the changes. If they don't address the issue, stop and say what is missing.

## 3. Checks

Run each check as a separate Bash call: `npm run lint`, `npm run typecheck`, `cd D:/Projects/job-tracker && npm test` (Vitest needs the uppercase drive, see CLAUDE.md). Also run `cd D:/Projects/job-tracker && npm run test:db` if the changes touch `*.db.test.ts`, `queries.ts` or `prisma/`, and `npm run e2e` if they touch `src/app/`, `components/` or `e2e/` (never both at once). On any failure: show the output and stop. Nothing is committed or pushed.

## 4. Commit

If there are uncommitted changes: stage the files by name (never `git add -A` or `.`). If a file looks unrelated to the change, or is a secret or local file, stop and ask. Commit with a Conventional Commit message.

## 5. Push

`git push -u origin <current branch>`, naming the branch explicitly. Never push `main`, never `--force`.

## 6. Pull request

If a PR already exists, the push has updated it. Read it with `gh pr view <number> --comments`, then add a comment with `gh pr comment <number> --body-file -`: the commits not yet covered by the description or an earlier comment, what they change, and the checks with their results. Then list the parts of the PR description that are now out of date; don't edit the description. Report the PR URL and stop. Otherwise run `gh pr create --base main`:

- Title: a Conventional Commit summary of the branch (the commit subject if there is one commit).
- Body sections: `## What` (what changed and why, by area), `## Verification` (each check run with its result and test counts; any manual checks I still need to do), `## Notes` (follow-ups, known limits; omit if none). Add `Closes #<number>` if an issue was given. End with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

Never merge. Report the PR URL.
