# Job Tracker

Web app to track job applications (statuses, notes, history), built milestone by milestone (M1–M8, one per week).
**`SPEC.md` is the source of truth** for scope, acceptance criteria, data model and cross-feature invariants (status changes, per-user scoping, not-found never forbidden). Read the relevant user story and its milestone before building a feature. Don't build later milestones or non-goals.

@AGENTS.md

## Commands

- A task is done only when `npm run lint && npm run typecheck && npm test` pass.
- If `npm test` reports "no tests" in every file, run it from `D:\` (Vitest fails from a lowercase drive).
- Never run `npm run test:db` alongside `npm run e2e`: both use `job_tracker_e2e`, and e2e always binds port 3100. This holds across worktrees and other checkouts too: one run at a time.

## Stack

- Tailwind runs through a Turbopack CSS loader rule (`@tailwindcss/turbopack`), not PostCSS.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`.
- Better Auth uses database sessions. There is no `/api/auth` route handler: forms call `auth.api` from Server Actions.

## Structure

- `src/app` holds routes and layouts only; logic goes in `src/features/<feature>/` (`components/`, `actions.ts`, `schemas.ts`, `queries.ts`)
- Pages and the header live in the `(main)` route group, so `src/app/error.tsx` covers the header too; keep the root layout free of anything that can throw
- `src/lib/db.ts` is the single Prisma client instance
- `src/lib/current-user.ts` is the only source of `userId`
- `src/proxy.ts` is an optimistic redirect on the session cookie only (no database). Never the security check

## Conventions

- Server Components by default; `"use client"` only for state, effects or browser APIs
- All mutations are Server Actions
- Users see generic error messages only; real errors go to server logs
- `redirect()` and `notFound()` throw: keep them outside try/catch
- Tailwind only, no component libraries
- Files: kebab-case; React components: PascalCase
- Commits: Conventional Commits. Don't add `Co-Authored-By` trailers.
- Record new product/architecture decisions in the SPEC.md decision log. Resolve open questions with the user, not silently.

## Rules

- Never read or edit `.env` files: they hold secrets (`.env.example` is fine)
- Never run destructive DB commands (`migrate reset`, `--force-reset`) without asking
- Before installing any new package, stop and ask for confirmation, even if the user requested it: name the package, why it's needed, and a no-dependency alternative (e.g. `Intl.DateTimeFormat`). Install only after an explicit "yes".
- Every app DB query is scoped to the current user through the DAL, no exceptions: `Application` queries filter by `userId`, and `StatusChange` queries go through an `Application` already checked for ownership. `userId` comes from the session, never from the request
- Keep diffs small: one task = one change, no unrelated refactors
- Any change beyond what was asked or planned (a file, stub, helper, test, removed assertion, a different approach): name it and wait before writing it. A skill rule that explains why it's needed isn't approval
- Don't change existing tests to make them pass. If a test looks wrong, stop and ask
- If requirements are ambiguous or conflict with SPEC.md, ask before coding
- If unsure about a library API (Prisma, Zod, the auth library), check the docs for the installed version (see `package.json`) before writing code; don't guess
- Tooling follows the milestones too: CI comes in M7. Don't add it early, even as a fix; propose it instead
- In a plan, list the assumptions and product decisions you made separately, so I can confirm them
- In code review, report only what affects correctness or SPEC.md requirements. If a finding relies on library, browser or database behavior, verify it before reporting it (libraries in the installed version), or label it unverified
- A claim that something works, is covered or is not a defect needs a run, a reproduction or a docs/source check; otherwise label it reasoning and offer the check

## Hooks

Hooks live in `.claude/hooks/`, wired in `.claude/settings.json`; each one explains itself when it blocks. For a TDD red phase, create `.claude/stop-checks.off` to switch stop-checks off; delete it afterwards.
