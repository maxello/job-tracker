# Job Tracker

Web app to track job applications (statuses, notes, history), built milestone by milestone (M1–M8, one per week).
**`SPEC.md` is the source of truth** for scope, acceptance criteria, data model and cross-feature invariants (status changes, per-user scoping, 404 not 403). Read the relevant user story and its milestone before building a feature. Don't build later milestones or non-goals.

@AGENTS.md

`docs/` is gitignored personal course material, not project documentation. When writing Ukrainian text there, keep IT terms in English.

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
- Don't add dependencies without asking
- Keep diffs small: one task = one change, no unrelated refactors
- If requirements are ambiguous or conflict with SPEC.md, ask before coding

## Not built yet (don't invent these)

- Database: Prisma, Neon and Zod are not installed yet
- Auth: none yet; until M2 it will be a demo-user stub, real auth comes in M2
- Tests: no test framework until M3, don't add one
