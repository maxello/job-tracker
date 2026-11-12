---
name: new-feature
description: Run the TDD workflow for one SPEC.md user story, from questions to plan, red tests, implementation and commit, stopping for review after each step.
argument-hint: "[story, e.g. US-8 archive application]"
disable-model-invocation: true
---

# New feature: $ARGUMENTS

Follow CLAUDE.md throughout (rules, commands, Conventional Commits, Vitest drive note). Each step ends with **STOP**: wait for my reply before the next step.

## 1. Understand

- If the current branch is `main`, stop and ask me to create a branch.
- Read SPEC.md: the story for $ARGUMENTS, its milestone, "Conventions used by all stories" in section 4, open questions (section 9), the decision log (section 10), and the section 11 items for the milestone. Read the existing code it touches.
- List every ambiguity or conflict with SPEC.md or existing code as questions. Don't decide them.
- **STOP.** After I answer, record the answers in the story's acceptance criteria (section 4) and the product decisions in the decision log (section 10). Commit that on its own (`docs(spec): …`).

## 2. Plan

- Tests first: each unit, db (`*.db.test.ts`) and e2e test, and which acceptance criterion or section 11 item for the milestone it covers.
- Then the implementation steps, by file.
- List assumptions separately.
- **STOP** for approval.

## 3. Red phase

- Create `.claude/stop-checks.off`.
- Write only the tests. Add stubs where needed so each test fails on an assertion, not on a build or import error.
- Run them and show each failure and why it is the right one. Name any test that is already green.
- **STOP** for review. From here on, don't change a test without asking.

## 4. Implement

- Small steps. After each: `npm run lint && npm run typecheck && npm test` (plus `npm run test:db` when there are db tests).
- For each test that was green in step 3: show it fails against a deliberately wrong implementation, then revert.
- Delete `.claude/stop-checks.off` before the final run.

## 5. Evidence and commit

- Show the output of `npm run lint && npm run typecheck && npm test`, `npm run test:db` if there are db tests, and `npm run e2e` when the story has UI (not at the same time as test:db).
- List every plan item and section 11 item for the milestone that no test covers, as a manual checklist for me.
- Commit (Conventional Commits). Don't push or open a PR.
- **STOP.**
