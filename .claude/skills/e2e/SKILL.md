---
name: e2e
description: "Playwright e2e conventions for this project (env guard, test database, users, navigation, locators, proving assertions can fail, which specs to run). Use when writing or changing a spec or helper in e2e/, changing playwright.config.ts, or debugging an e2e failure. Not for unit tests, db tests (*.db.test.ts, npm run test:db), or app code changes that don't touch an e2e test."
user-invocable: false
---

# E2E (Playwright)

Reference specs: `preserved-routes.spec.ts` (client-side navigation), `cross-user-isolation.spec.ts` (two users, swapped ids), `change-status.spec.ts` (waiting on a result, aria snapshot), `archive-application.spec.ts` (focus after hydration).

## Environment

- `e2e/env.ts` is the only loader for e2e and `test:db`: it reads the e2e env file (its values override the shell, so the dev database can't leak in), refuses any database but `job_tracker_e2e`, and requires `BETTER_AUTH_URL` = `http://localhost:3100` (otherwise Server Action and Better Auth origin checks fail). `e2e/reset.sql` is a second guard in Postgres. Never weaken either.
- Never read that env file; if the guard throws, report its message. Keep the file name out of commands and commit messages: `block-env-access` matches command text.
- Its `DATABASE_URL` must be the direct URL, not `-pooler`: `migrate deploy` takes an advisory lock that hangs through PgBouncer (`P1002`).

## Server and database

- `webServer` runs `migrate deploy`, `next build`, `next start` on :3100 and never reuses a server: the production build is what tests the PPR shell, the soft 404 and the `__Secure-` cookie. Don't switch to `next dev`.
- `next build` type-checks spec files too: in a red phase add stubs, so tests fail on assertions, not on "build failed".
- `global-setup.ts` truncates every table; then the `setup` project (`seed.setup.ts`) signs up `USER_A` through the real form (Playwright can't import the generated Prisma client).
- Serial (`workers: 1`, `fullyParallel: false`): parallel runs haven't been verified yet; don't change it in a spec task.
- Never run alongside `npm run test:db`: both use `job_tracker_e2e`, and the e2e truncate wipes db-test data mid-run.

## Users and data

- `USER_A` (`e2e/users.ts`) stays empty, because `sign-in.spec.ts` expects an empty list. Never create data as `USER_A`.
- A test that creates data calls `signUpFreshUser(page)` (`e2e/fresh-user.ts`) in `beforeEach`, and every name it asserts on comes from `uniqueName()`, so tests don't depend on order or on each other.
- A second user gets `browser.newContext()` (own cookies), closed in `afterEach`/`finally`. Check "nothing changed" from the owner's side, not from the intruder's response.

## Navigation

- Reach pages as a user does, through links and buttons after one `page.goto` for the first load: Cache Components keeps up to 3 previous routes in the DOM, hidden by `<Activity>`, so duplicate ids and a stale client cache only show after client-side navigation.
- `page.goto` only when the URL is the point (deep link, `?status=foo`, a foreign or missing id, the first load); `page.reload()` only to check persistence.
- No `waitForTimeout`: wait on a visible result (URL, row or history count, button state).

## Locators

- `getByRole` with `{ exact: true }` for fixed names: substring matching hits neighbours ("Archive" matches "Unarchive"). `uniqueName()` values can stay non-exact.
- `exact` matches the whole accessible name or text: check the rendered text first, or the locator matches nothing.
- Scope to `main`, a named `region` or a `dialog` when the name also appears elsewhere (header vs page).
- Text with `aria-hidden` parts: match accessible text (`toMatchAriaSnapshot`, `toHaveAccessibleDescription`), not `textContent`.
- CSS `locator()` only for what has no role: hidden inputs, `meta`, `form` filtered by a field.

## Proving the test

- A test green on its first run proves nothing until it fails: break the code, or write the wrong implementation it guards against, and report a table "breakage → which tests failed, on which assertion".
- Prove every assertion can fail, not only the first: a test that fails early never reaches later checks. Build the UI on stubbed actions, or break one thing at a time, until each assertion has failed once.
- Negative assertions (`toHaveCount(0)`, `not.toBeVisible`, `not.toBeFocused`) pass for free when the locator is wrong or the page isn't ready: pair each with a positive check of the same locator elsewhere in the test.
- `not.toBeFocused()` passes before hydration: wait for it first (`reloadAndWaitForHydration` in `archive-application.spec.ts`).
- Name tests after what they cover: `US-n: <criterion>` or `#<issue>: <behaviour>`.

## Running

- While working, run only the changed specs: `npm run e2e -- e2e/<name>.spec.ts` (or `--grep`); the `setup` project runs through `dependencies`. Every run builds the app, so batch changes. Traces are kept only on failure (`--trace on` for a green run).
- The full suite runs once, in `/open-pr`; don't also run it in the working session.
