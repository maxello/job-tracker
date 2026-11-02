# Job Tracker

Web app to track job applications (statuses, notes, history), built milestone by milestone (M1–M8, one per week).
**`SPEC.md` is the source of truth** for scope, acceptance criteria, data model and cross-feature invariants (status changes, per-user scoping, not-found never forbidden). Read the relevant user story and its milestone before building a feature. Don't build later milestones or non-goals.

@AGENTS.md

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run format
npm run format:check
```

A task is done only when `npm run lint && npm run typecheck` pass.

## Stack

Next.js 16.4 (App Router) · React 19.3 · TypeScript strict · Tailwind v4 · Prisma + Neon (Postgres) · Zod

- Tailwind runs through a Turbopack CSS loader rule (`@tailwindcss/turbopack`), not PostCSS.
- `next.config.ts` enables `cacheComponents` and `partialPrefetching`.

## Structure

- All app code lives in `src/`; `public/` stays at the root. Alias `@/*` → `./src/*`.
- `src/app` — routes and layouts only (keep thin)
- `src/features/applications/` — `components/`, `actions.ts`, `schemas.ts`, `queries.ts`
- `src/lib/db.ts` — the single Prisma client instance

## Conventions

- Server Components by default; `"use client"` only for state, effects or browser APIs
- All mutations are Server Actions; validate input with Zod on the server
- Tailwind only, no component libraries
- Files: kebab-case; React components: PascalCase
- Commits: Conventional Commits. Don't add `Co-Authored-By` trailers.
- Record new product/architecture decisions in the SPEC.md decision log. Resolve open questions with the user, not silently.

## Rules

- Never read or edit `.env` files (`.env.example` is fine)
- Never run destructive DB commands (`migrate reset`, `--force-reset`) without asking
- Before installing any new package, stop and ask for confirmation, even if the user requested it: name the package, why it's needed, and a no-dependency alternative (e.g. `Intl.DateTimeFormat`). Install only after an explicit "yes".
- Keep diffs small: one task = one change, no unrelated refactors
- If requirements are ambiguous or conflict with SPEC.md, ask before coding
- If unsure about a library API (Prisma, Zod, the auth library), check the docs for the installed version (see `package.json`) before writing code; don't guess
- Tooling follows the milestones too: hooks come in M3, CI in M7. Don't add them early, even as a fix; propose it instead
- In a plan, list the assumptions and product decisions you made separately, so I can confirm them
- In code review, report only what affects correctness or SPEC.md requirements. If a finding relies on library behavior, verify it in the installed version before reporting it

## Not built yet (don't invent these)

- Auth: the demo-user stub (`src/lib/current-user.ts`) until M2, real auth comes in M2
- Tests: no test framework until M3, don't add one
- Hooks: only `.claude/hooks/block-env-access.mjs` (added ahead of plan); the rest come in M3
