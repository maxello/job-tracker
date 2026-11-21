---
name: new-feature
description: Run the TDD workflow for one SPEC.md user story, from questions to a reviewed plan, red tests, implementation, commit, code and security review and fixes, stopping for review after each step.
argument-hint: "[story, e.g. US-8 archive application]"
disable-model-invocation: true
---

# New feature: $ARGUMENTS

Follow CLAUDE.md throughout (rules, commands, Conventional Commits, Vitest drive note). Steps end with **STOP**: wait for my reply before the next step.

**STOP rule:** stop before any change whose result I haven't approved. Name it, say why it's needed, and wait; recording it in the decision log isn't approval, and neither is a skill rule that explains why it's needed. Real cases:

- a type stub added in the red phase
- a test file other than the planned one
- a design change in green: list rows re-parsing the URL instead of reusing the values already parsed
- assertions removed beyond the ones I asked to remove

## Files

Plans and review reports live in `plans/` at the repo root (git-ignored). Create it if it is missing. `<branch>` is the current branch with `/` replaced by `-`:

- plan: `plans/<branch>_plan.md`
- reports: `plans/review-<branch>-plan.md`, `plans/review-<branch>-code.md`, `plans/review-<branch>-security.md`
- from round 2 on, report names carry the round number: `plans/review-<branch>-plan-2.md`, `-code-2.md`, `-security-2.md`, and so on. Round 1 keeps the names above. Never overwrite a report.

## Classifying review findings (steps 2 and 6)

Classify each finding as **real**, **false positive** or **nit**, and type its basis as **measured**, **docs-verified** or **reasoning**.

- "Not a defect" on reasoning alone is not a verdict: label it reasoning and offer a measurement (a test, a reproduction, a docs check).
- For a process rule (e.g. no changed existing tests), my recorded consent is the basis. For correctness, only evidence is.

## 1. Understand

- If the current branch is `main`, stop and ask me to create a branch.
- Read SPEC.md: the story for $ARGUMENTS, its milestone, "Conventions used by all stories" in section 4, open questions (section 9), the decision log (section 10), and the section 11 items for the milestone. Read the existing code it touches.
- List every ambiguity or conflict with SPEC.md or existing code as questions. Don't decide them.
- **STOP.** After I answer, record the answers in the story's acceptance criteria (section 4) and the product decisions in the decision log (section 10). Commit that on its own (`docs(spec): …`).

## 2. Plan

- If the plan changes markup, load the `frontend-design` skill first.
- Write the plan to the plan file:
  - Tests first: each unit, db (`*.db.test.ts`) and e2e test, and which acceptance criterion or section 11 item for the milestone it covers.
  - Then the implementation steps, by file.
  - List assumptions separately.
- Run the `plan-reviewer` agent with only the plan file path and the story id. Don't explain the plan.
- Save its report verbatim to `plans/review-<branch>-plan.md` and show it to me verbatim.
- Classify each finding (see above).
- **STOP** for approval. After my reply, change the plan only as I approve. Run `plan-reviewer` again only when I ask for it.

## 3. Red phase

- Create `.claude/stop-checks.off`.
- Write only the tests. Add stubs where needed so each test fails on an assertion, not on a build or import error.
- Run them and show each failure and why it is the right one. Name any test that is already green.
- For each already-green test, name the specific wrong implementation step 4 will use to prove it can fail. "Remove the feature" isn't enough if the test can still pass that way (e.g. `null` == `null`).
- For e2e tests, here and in step 4, follow the `e2e` skill: every assertion must fail once, not only the first.
- **STOP** for review. From here on, don't change a test without asking.

## 4. Implement

- Small steps. After each: `npm run lint && npm run typecheck && npm test` (plus `npm run test:db` when there are db tests).
- For each test that was green in step 3: show it fails against a deliberately wrong implementation, then revert.
- Delete `.claude/stop-checks.off` before the final run.
- If the work needs a file, element, approach, helper, stub, test or removed assertion that isn't in the plan: **STOP** before writing it.
- Before the commit, compare the diff with the plan and name every file, element, approach, helper, stub, test or removed assertion that isn't in the plan.

## 5. Evidence and commit

- Show the output of `npm run lint && npm run typecheck && npm test`, `npm run test:db` if there are db tests, and `npm run e2e -- <changed specs>` when the story has UI (not at the same time as test:db; the full suite runs in `/open-pr`).
- Commit (Conventional Commits). Don't push or open a PR.
- Go on to step 6 without stopping.

## 6. Review

- Write the diff outside the repo: `git diff main...HEAD --output="$env:TEMP\review-<branch>.diff"`.
- Run `code-reviewer` and `security-reviewer` in parallel: one message, two Agent calls. Give each only the diff path, the base (`main...HEAD`) and the story id. Don't explain the change.
- Save both reports verbatim to `plans/review-<branch>-code.md` and `plans/review-<branch>-security.md`, and show them to me verbatim.
- Classify each finding (see above).
- **STOP.**

## 7. Fix

- Fix only the findings I approve, one commit each (Conventional Commits). After each fix, run only the tests it changes or that cover the changed code.
- Run a second review round (step 6) only when I ask for it.
- List every plan item and section 11 item for the milestone that no test covers, as a manual checklist for me.
- **STOP.** When I reply with the checks I did, write them into the plan file under `## Manual checks done`.
- Then tell me to run `/open-pr` with the plan file path (`plans/<branch>_plan.md`): it doesn't search for one.
